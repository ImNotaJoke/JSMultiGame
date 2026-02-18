import { useEffect, useCallback } from 'react';
import { Peer, DataConnection } from 'peerjs';
import { useGameStore } from '../store/useGameStore';
import { peerConfig } from '../config/peerConfig';
import type { ChatMessage, PenduState } from '../store/useGameStore';

export type PeerMessage =
  | { type: 'CHANGE_GAME'; game: 'HUB' | 'PENDU' }
  | { type: 'PENDU_UPDATE'; payload: Partial<PenduState> }
  | { type: 'CHAT_MESSAGE'; payload: ChatMessage }
  | { type: 'PLAYER_SYNC'; payload: { id: string; name: string } }
  | { type: 'REQUEST_SYNC' }
  | { type: 'FULL_SYNC'; payload: { pendu: PenduState; game: 'HUB' | 'PENDU' } };

let peerInstance: Peer | null = null;
let peerConnections: Record<string, DataConnection> = {};
let peerInitialized = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectAttempts = 0;

/** Message types that the host should relay to all other peers */
const RELAY_TYPES: PeerMessage['type'][] = ['PENDU_UPDATE', 'CHAT_MESSAGE', 'PLAYER_SYNC'];

function handleMessage(data: PeerMessage, senderId?: string) {
  const store = useGameStore.getState();

  switch (data.type) {
    case 'CHANGE_GAME': {
      // Only accept CHANGE_GAME from the room host
      if (senderId && store.pendu.hostId && senderId !== store.pendu.hostId) {
        console.warn('[PeerJS] CHANGE_GAME ignoré: seul l\'hôte peut changer de vue');
        break;
      }
      store.setCurrentGame(data.game);
      if (data.game === 'HUB') {
        store.resetPendu();
      }
      break;
    }
    case 'PENDU_UPDATE':
      store.updatePendu(data.payload);
      break;
    case 'CHAT_MESSAGE':
      store.addChatMessage(data.payload);
      break;
    case 'PLAYER_SYNC':
      store.addPlayer({ id: data.payload.id, name: data.payload.name, isHost: false });
      break;
    case 'REQUEST_SYNC': {
      const syncData: PeerMessage = {
        type: 'FULL_SYNC',
        payload: { pendu: store.pendu, game: store.currentGame }
      };
      // Reply only to requester if possible
      if (senderId && peerConnections[senderId]?.open) {
        peerConnections[senderId].send(syncData);
      } else {
        broadcast(syncData);
      }
      break;
    }
    case 'FULL_SYNC': {
      const incomingPendu = { ...data.payload.pendu };
      // If we have remote players, force versus mode
      if (store.players.length > 0 && incomingPendu.mode === 'solo') {
        incomingPendu.mode = 'versus';
      }
      // Keep our hostId if incoming doesn't have one
      if (!incomingPendu.hostId && store.pendu.hostId) {
        incomingPendu.hostId = store.pendu.hostId;
      }
      // Only update if state actually changed (avoid unnecessary re-renders)
      if (JSON.stringify(store.pendu) !== JSON.stringify(incomingPendu)) {
        store.updatePendu(incomingPendu);
      }
      if (store.currentGame !== data.payload.game) {
        store.setCurrentGame(data.payload.game);
      }
      break;
    }
  }
}

/**
 * Relay a message from one peer to all other peers (host-only).
 * This is critical because non-host players are only connected to the host,
 * not to each other. Without relay, player B's actions are invisible to player C.
 */
function relayToOthers(data: PeerMessage, excludePeerId: string) {
  Object.entries(peerConnections).forEach(([peerId, conn]) => {
    if (peerId !== excludePeerId && conn.open) {
      conn.send(data);
    }
  });
}

function setupConnection(conn: DataConnection) {
  conn.on('open', () => {
    peerConnections[conn.peer] = conn;
    const store = useGameStore.getState();
    store.addPlayer({ id: conn.peer, name: `Joueur_${conn.peer.slice(0, 5)}`, isHost: false });
    conn.send({
      type: 'PLAYER_SYNC',
      payload: { id: store.myId, name: store.myName || `Joueur_${store.myId.slice(0, 5)}` }
    });

    // Auto-switch to versus when someone joins during LOBBY
    if (store.pendu.phase === 'LOBBY') {
      store.updatePendu({ mode: 'versus', hostId: store.pendu.hostId || store.myId });
      // Send FULL_SYNC so the newcomer gets the current state
      setTimeout(() => {
        const s = useGameStore.getState();
        conn.send({
          type: 'FULL_SYNC',
          payload: { pendu: s.pendu, game: s.currentGame }
        });
      }, 300);
    }
  });

  conn.on('data', (data: any) => {
    const msg = data as PeerMessage;
    handleMessage(msg, conn.peer);

    // Host relay: forward relevant messages to all other peers
    const store = useGameStore.getState();
    if (store.pendu.hostId === store.myId && RELAY_TYPES.includes(msg.type)) {
      relayToOthers(msg, conn.peer);
    }
  });

  conn.on('close', () => {
    const store = useGameStore.getState();
    const leavingId = conn.peer;
    store.removePlayer(leavingId);
    delete peerConnections[leavingId];

    // If the host disconnected, all players go back to hub
    if (leavingId === store.pendu.hostId) {
      store.resetPendu();
      store.setCurrentGame('HUB');
      return;
    }

    // Handle game state when a non-host player leaves during versus
    if (store.pendu.mode === 'versus' && store.pendu.phase === 'PLAYING') {
      const newStates = store.pendu.playerStates.map(ps =>
        ps.playerId === leavingId ? { ...ps, eliminated: true } : { ...ps }
      );

      const update: Partial<PenduState> = { playerStates: newStates };

      // If it was the leaving player's turn, advance to next active player
      if (store.pendu.currentTurnId === leavingId) {
        const active = newStates.filter(ps => !ps.eliminated && ps.playerId !== store.pendu.chooserId);
        if (active.length > 0) {
          update.currentTurnId = active[0].playerId;
        } else {
          update.phase = 'ROUND_LOST';
        }
      }

      // Check if any active players remain
      const remaining = newStates.filter(ps => !ps.eliminated && ps.playerId !== store.pendu.chooserId);
      if (remaining.length === 0 && !update.phase) {
        update.phase = 'ROUND_LOST';
      }

      store.updatePendu(update);
      // Host broadcasts the updated state to remaining players
      if (store.pendu.hostId === store.myId) {
        broadcast({ type: 'PENDU_UPDATE', payload: update });
      }
    }
  });
}

function broadcast(data: PeerMessage) {
  Object.values(peerConnections).forEach((conn) => {
    if (conn.open) conn.send(data);
  });
}

/**
 * Crée et configure une instance Peer avec gestion d'erreurs.
 */
function createPeer(): Peer {
  const peer = new Peer(peerConfig);

  peer.on('open', (id) => {
    reconnectAttempts = 0; // reset on successful connection
    useGameStore.getState().setMyId(id);
    const store = useGameStore.getState();
    if (!store.myName) {
      store.setMyName(`Joueur_${id.slice(0, 5)}`);
    }
    console.log('[PeerJS] Connecté au serveur de signaling, id:', id);
  });

  peer.on('connection', (conn) => setupConnection(conn));

  peer.on('error', (err) => {
    console.error('[PeerJS] Erreur:', err.type, err.message);

    // Si le serveur de signaling est injoignable → reconnecter
    if (
      err.type === 'network' ||
      err.type === 'server-error' ||
      err.type === 'socket-error' ||
      err.type === 'socket-closed'
    ) {
      scheduleReconnect();
    }

    // peer-unavailable = l'ID distant n'existe pas → pas de reconnexion
    if (err.type === 'peer-unavailable') {
      console.warn('[PeerJS] Peer distant introuvable. Vérifie l\'ID.');
    }
  });

  peer.on('disconnected', () => {
    console.warn('[PeerJS] Déconnecté du serveur de signaling');
    // Tenter de reconnecter au serveur de signaling (pas de nouveau Peer)
    if (!peer.destroyed) {
      peer.reconnect();
    }
  });

  peer.on('close', () => {
    console.warn('[PeerJS] Peer fermé');
  });

  return peer;
}

/**
 * Re-création du Peer après un échec réseau.
 */
function scheduleReconnect() {
  if (reconnectTimer) return;
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[PeerJS] Abandon après', MAX_RECONNECT_ATTEMPTS, 'tentatives');
    return;
  }
  reconnectAttempts++;
  const delay = Math.min(2000 * reconnectAttempts, 10000);
  console.log(`[PeerJS] Reconnexion dans ${delay}ms (tentative ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (peerInstance) {
      peerInstance.destroy();
    }
    peerInstance = createPeer();
  }, delay);
}

/**
 * Hook d'initialisation du Peer — à appeler UNE SEULE FOIS dans App.tsx.
 */
export function usePeerInit() {
  useEffect(() => {
    if (peerInitialized) return;
    peerInitialized = true;

    peerInstance = createPeer();

    // Periodic state sync from host (safety net for missed messages)
    const syncInterval = setInterval(() => {
      const store = useGameStore.getState();
      if (
        store.pendu.hostId === store.myId &&
        store.pendu.mode === 'versus' &&
        Object.keys(peerConnections).length > 0
      ) {
        broadcast({
          type: 'FULL_SYNC',
          payload: { pendu: store.pendu, game: store.currentGame }
        });
      }
    }, 5000);

    return () => {
      clearInterval(syncInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      peerInstance?.destroy();
      peerInstance = null;
      peerConnections = {};
      peerInitialized = false;
      reconnectAttempts = 0;
    };
  }, []);
}

/**
 * Hook utilitaire — retourne les méthodes réseau sans recréer de Peer.
 */
export const usePeer = () => {
  const connectToFriend = useCallback((friendId: string) => {
    if (!friendId.trim()) return;
    if (!peerInstance || peerInstance.destroyed) {
      console.error('[PeerJS] Pas de connexion au serveur de signaling. Réessaie dans un instant…');
      // Auto-reconnect then retry
      peerInstance = createPeer();
      peerInstance.on('open', () => {
        const conn = peerInstance?.connect(friendId, { reliable: true });
        if (conn) setupConnection(conn);
      });
      return;
    }
    const conn = peerInstance.connect(friendId, { reliable: true });
    if (conn) setupConnection(conn);
  }, []);

  const disconnectAll = useCallback(() => {
    Object.values(peerConnections).forEach((conn) => {
      conn.close();
    });
    peerConnections = {};
    const store = useGameStore.getState();
    // Remove all remote players
    store.players.forEach(p => store.removePlayer(p.id));
  }, []);

  const sendChat = useCallback((text: string) => {
    const store = useGameStore.getState();
    const msg: ChatMessage = {
      id: `${store.myId}-${Date.now()}`,
      senderId: store.myId,
      senderName: store.myName || `Joueur_${store.myId.slice(0, 5)}`,
      text,
      timestamp: Date.now(),
    };
    store.addChatMessage(msg);
    broadcast({ type: 'CHAT_MESSAGE', payload: msg });
  }, []);

  return { connectToFriend, broadcast, sendChat, disconnectAll };
};