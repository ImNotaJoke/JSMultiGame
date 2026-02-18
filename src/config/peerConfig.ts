import type { PeerJSOption } from 'peerjs';

/**
 * Configuration PeerJS optimisée pour fonctionner en HTTPS (Vercel, etc.)
 *
 * - `secure: true`  → force WSS (WebSocket Secure) vers le serveur de signaling
 * - ICE servers     → STUN + TURN gratuits pour traverser les NAT / firewalls
 */

const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';

export const peerConfig: PeerJSOption = {
  // ─── Signaling server (PeerJS Cloud) ───
  // Force secure WebSocket in production (HTTPS)
  secure: isSecure,
  port: isSecure ? 443 : 9000,

  // ─── ICE servers for WebRTC ───
  config: {
    iceServers: [
      // Google STUN (gratuit, fiable)
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },

      // Open STUN servers supplémentaires
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.voipbuster.com:3478' },

      // Open Relay TURN servers (gratuits, anonymes)
      // Nécessaires quand le STUN seul ne suffit pas (réseaux restrictifs)
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ],
    // Utiliser tous les candidats possibles
    iceCandidatePoolSize: 10,
  },

  debug: isSecure ? 0 : 2, // logs en dev uniquement
};
