import { useState, useEffect } from 'react';
import { useGameStore } from '../../store/useGameStore';
import './Navbar.css';

interface NavbarProps {
  /** Label of the currently active page, shown highlighted in the center links */
  activePage: string;
}

export default function Navbar({ activePage }: NavbarProps) {
  const { myId, myName, setMyName, setCurrentGame } = useGameStore();
  const [showCredits, setShowCredits] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('jsmg_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('jsmg_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  const copyId = () => {
    if (myId) navigator.clipboard.writeText(myId);
  };

  const goToHub = () => {
    if (activePage !== 'Liste Jeu') {
      useGameStore.getState().resetPendu();
      setCurrentGame('HUB');
    }
  };

  return (
    <>
      <nav className="hub-navbar">
        <div className="hub-navbar-left">
          <span className="hub-logo" onClick={goToHub} style={{ cursor: 'pointer' }}>JSHub</span>
        </div>
        <div className="hub-navbar-center">
          <button
            className={`hub-nav-link ${activePage === 'Liste Jeu' ? 'active' : ''}`}
            onClick={goToHub}
          >
            Liste Jeu
          </button>
          <button
            className={`hub-nav-link ${activePage === 'Crédit' ? 'active' : ''}`}
            onClick={() => setShowCredits(!showCredits)}
          >
            Crédit
          </button>
        </div>
        <div className="hub-navbar-right">
          <button className="hub-theme-btn" onClick={toggleTheme} title="Changer de thème">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <input
            value={myName}
            onChange={e => setMyName(e.target.value)}
            placeholder="Pseudo..."
            className="hub-pseudo-input"
          />
          <div className="hub-avatar" title={myId || 'Non connecté'} onClick={copyId}>
            {myName ? myName.charAt(0).toUpperCase() : '?'}
          </div>
        </div>
      </nav>

      {/* ─── Credits overlay ─── */}
      {showCredits && (
        <div className="hub-credits-overlay" onClick={() => setShowCredits(false)}>
          <div className="hub-credits-box" onClick={e => e.stopPropagation()}>
            <h2>Crédits</h2>
            <p>JSMultiGame — Jeu multijoueur en ligne</p>
            <p>Développé avec React + PeerJS</p>
            <button className="hub-credits-close" onClick={() => setShowCredits(false)}>Fermer</button>
          </div>
        </div>
      )}
    </>
  );
}
