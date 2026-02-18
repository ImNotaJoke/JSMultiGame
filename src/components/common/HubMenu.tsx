import { useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { usePeer } from '../../hooks/usePeer';
import GameCard from './GameCard';
import ChatRoom from '../chat/ChatRoom';
import Navbar from './Navbar';
import './HubMenu.css';

export default function HubMenu() {
  const { myId, setCurrentGame, players, updatePendu } = useGameStore();
  const { connectToFriend, broadcast, disconnectAll } = usePeer();
  const [joinId, setJoinId] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);

  const isConnected = players.length > 0;

  const handleCreatePendu = () => {
    const mode = players.length > 0 ? 'versus' : 'solo';
    updatePendu({ phase: 'LOBBY', hostId: myId, mode });
    setCurrentGame('PENDU');
    if (players.length > 0) {
      broadcast({ type: 'PENDU_UPDATE', payload: { phase: 'LOBBY', hostId: myId, mode: 'versus' } });
      broadcast({ type: 'CHANGE_GAME', game: 'PENDU' });
    }
  };

  const handleJoinRoom = () => {
    if (!joinId.trim()) return;
    connectToFriend(joinId.trim());
    setJoinId('');
    setShowJoinInput(false);
  };

  const handleQuitRoom = () => {
    disconnectAll();
  };

  const copyId = () => {
    if (myId) navigator.clipboard.writeText(myId);
  };

  return (
    <div className="hub-page">
      <Navbar activePage="Liste Jeu" />

      {/* ─── Connection bar ─── */}
      <div className="hub-connect-bar">
        <div className="hub-connect-left">
          <span className="hub-id-label">Ton ID :</span>
          <span className="hub-id-value" onClick={copyId} title="Cliquer pour copier">{myId || '...'}</span>
        </div>
        <div className="hub-connect-right">
          {!isConnected ? (
            <>
              {!showJoinInput ? (
                <button className="hub-join-btn" onClick={() => setShowJoinInput(true)}>
                  Rejoindre une room
                </button>
              ) : (
                <div className="hub-join-row">
                  <input
                    autoFocus
                    value={joinId}
                    onChange={e => setJoinId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
                    placeholder="ID de l'hôte..."
                    className="hub-join-input"
                  />
                  <button className="hub-join-btn" onClick={handleJoinRoom}>OK</button>
                  <button className="hub-cancel-btn" onClick={() => { setShowJoinInput(false); setJoinId(''); }}>✕</button>
                </div>
              )}
            </>
          ) : (
            <div className="hub-connected-row">
              <span className="hub-connected-badge">
                🟢 {players.length} joueur{players.length > 1 ? 's' : ''} connecté{players.length > 1 ? 's' : ''}
              </span>
              <button className="hub-quit-btn" onClick={handleQuitRoom}>
                Quitter la room
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Main content ─── */}
      <div className="hub-main">
        {/* Games grid */}
        <div className="hub-games-area">
          {isConnected && (
            <p className="hub-host-notice">
              👑 L'hôte choisit la partie à lancer
            </p>
          )}
          <div className="hub-games-grid">
            <GameCard
              title="PENDU"
              imagePath="/images/pendu/icon/JeuDuPendu.png"
              onCreate={handleCreatePendu}
            />
            <div className="gamecard-placeholder">
              <span> Bientôt</span>
            </div>
            <div className="gamecard-placeholder">
              <span> Bientôt</span>
            </div>
            <div className="gamecard-placeholder">
              <span> Bientôt</span>
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="hub-chat-area">
          <ChatRoom />
        </div>
      </div>
    </div>
  );
}