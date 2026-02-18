import { useState, useCallback } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { usePeer } from '../../hooks/usePeer';
import ChatRoom from '../../components/chat/ChatRoom';
import Navbar from '../../components/common/Navbar';
import wordsData from '../../data/words.json';
import type { PenduPlayerState, PenduState } from '../../store/useGameStore';
import './Pendu.css';

const MAX_MISTAKES = 5;
const MAX_WORD_ATTEMPTS = 3;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function CrossIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <line x1="5" y1="5" x2="35" y2="35" stroke="#ff3333" strokeWidth="6" strokeLinecap="round" />
      <line x1="35" y1="5" x2="5" y2="35" stroke="#ff3333" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

function SkullIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <ellipse cx="32" cy="26" rx="22" ry="24" fill="#fff" stroke="#333" strokeWidth="2" />
      <ellipse cx="22" cy="22" rx="6" ry="7" fill="#333" />
      <ellipse cx="42" cy="22" rx="6" ry="7" fill="#333" />
      <polygon points="32,30 28,38 36,38" fill="#333" />
      <rect x="22" y="44" width="3" height="8" rx="1" fill="#fff" stroke="#333" strokeWidth="1" />
      <rect x="28" y="44" width="3" height="8" rx="1" fill="#fff" stroke="#333" strokeWidth="1" />
      <rect x="34" y="44" width="3" height="8" rx="1" fill="#fff" stroke="#333" strokeWidth="1" />
      <rect x="40" y="44" width="3" height="8" rx="1" fill="#fff" stroke="#333" strokeWidth="1" />
    </svg>
  );
}

function normalize(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

export default function Pendu() {
  const store = useGameStore();
  const { broadcast, sendChat } = usePeer();
  const { myId, players, pendu, updatePendu } = store;
  const [wordGuess, setWordGuess] = useState('');
  const [notification, setNotification] = useState('');
  const [lobbyDifficulty, setLobbyDifficulty] = useState<'facile' | 'moyen' | 'difficile'>('facile');
  const [lobbyMode, setLobbyMode] = useState<'solo' | 'versus'>(pendu.mode || 'solo');

  // Sync lobbyMode when pendu.mode changes (e.g. after FULL_SYNC switches to versus)
  const currentPenduMode = pendu.mode;
  if (pendu.phase === 'LOBBY' && currentPenduMode === 'versus' && lobbyMode === 'solo') {
    setLobbyMode('versus');
  }

  const isSolo = pendu.mode === 'solo';

  // In LOBBY phase, always list all connected players so we can see who's here
  const allPlayers = (pendu.phase === 'LOBBY' || !isSolo)
    ? [
        { id: myId, name: store.myName || `Joueur_${myId.slice(0, 5)}` },
        ...players.map(p => ({ id: p.id, name: p.name })),
      ]
    : [{ id: myId, name: store.myName || `Joueur_${myId.slice(0, 5)}` }];

  const isHost = pendu.hostId === myId;
  const myState = pendu.playerStates.find(ps => ps.playerId === myId);
  const isMyTurn = pendu.currentTurnId === myId;
  const isChooser = pendu.chooserId === myId && !isSolo;

  const showNotif = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3000);
  }, []);

  const pickRandomPlayer = useCallback((excluded?: string) => {
    const eligible = allPlayers.filter(p => p.id !== excluded);
    if (eligible.length === 0) return allPlayers[0]?.id || myId;
    return eligible[Math.floor(Math.random() * eligible.length)].id;
  }, [allPlayers, myId]);

  const launchGame = useCallback((difficulty: 'facile' | 'moyen' | 'difficile', mode: 'solo' | 'versus') => {
    const wordList = wordsData[difficulty];
    const randomWord = wordList[Math.floor(Math.random() * wordList.length)];

    const playersForGame = mode === 'solo'
      ? [{ id: myId, name: store.myName || `Joueur_${myId.slice(0, 5)}` }]
      : allPlayers;

    const chooser = mode === 'solo' ? '' : pickRandomPlayer();

    const playerStates: PenduPlayerState[] = playersForGame.map(p => ({
      playerId: p.id,
      mistakes: 0,
      wordAttempts: 0,
      eliminated: false,
    }));

    const firstPlayer = mode === 'solo'
      ? myId
      : (playersForGame.find(p => p.id !== chooser)?.id || chooser);

    const newState: Partial<PenduState> = {
      word: normalize(randomWord),
      maskedWord: normalize(randomWord).split('').map(() => '_'),
      guessedLetters: [],
      wrongLetters: [],
      phase: 'PLAYING',
      mode,
      difficulty,
      hostId: pendu.hostId || myId,
      chooserId: chooser,
      currentTurnId: firstPlayer,
      playerStates,
      winnerId: '',
      roundNumber: (pendu.roundNumber || 0) + 1,
    };

    updatePendu(newState);
    if (mode === 'versus') {
      broadcast({ type: 'PENDU_UPDATE', payload: newState });
    }
  }, [allPlayers, myId, store.myName, pendu.roundNumber, pendu.hostId, broadcast, updatePendu, pickRandomPlayer]);

  const getNextPlayer = useCallback((currentId: string, states: PenduPlayerState[]) => {
    if (isSolo) return myId;
    const active = states.filter(ps => !ps.eliminated && ps.playerId !== pendu.chooserId);
    if (active.length === 0) return '';
    const currentIdx = active.findIndex(ps => ps.playerId === currentId);
    const nextIdx = (currentIdx + 1) % active.length;
    return active[nextIdx].playerId;
  }, [pendu.chooserId, isSolo, myId]);

  const guessLetter = useCallback((letter: string) => {
    if (pendu.phase !== 'PLAYING') return;
    if (!isSolo && (!isMyTurn || isChooser)) return;
    if (myState?.eliminated) return;

    const normalLetter = normalize(letter);
    if (pendu.guessedLetters.includes(normalLetter)) return;

    const newGuessed = [...pendu.guessedLetters, normalLetter];
    const wordNorm = normalize(pendu.word);
    const isCorrect = wordNorm.includes(normalLetter);

    let newMasked = [...pendu.maskedWord];
    if (isCorrect) {
      wordNorm.split('').forEach((ch, i) => {
        if (ch === normalLetter) newMasked[i] = pendu.word[i];
      });
    }

    let newWrong = [...pendu.wrongLetters];
    let newStates = pendu.playerStates.map(ps => ({ ...ps }));
    const meIdx = newStates.findIndex(ps => ps.playerId === myId);

    if (!isCorrect) {
      newWrong.push(normalLetter);
      if (meIdx >= 0) {
        newStates[meIdx].mistakes += 1;
        if (newStates[meIdx].mistakes >= MAX_MISTAKES) {
          newStates[meIdx].eliminated = true;
          showNotif('💀 Éliminé par trop de mauvaises lettres !');
        }
      }
    }

    const wordComplete = !newMasked.includes('_');
    const remainingActive = newStates.filter(ps => !ps.eliminated && ps.playerId !== pendu.chooserId);

    let phase: PenduState['phase'] = 'PLAYING';
    let winnerId = '';

    if (wordComplete) {
      phase = 'ROUND_WON';
      winnerId = myId;
      showNotif('🎉 Mot trouvé !');
    } else if (remainingActive.length === 0) {
      phase = 'ROUND_LOST';
      showNotif('😵 Tous les joueurs sont éliminés !');
    }

    const nextTurn = (phase === 'PLAYING')
      ? (isSolo ? myId : (isCorrect ? myId : getNextPlayer(myId, newStates)))
      : pendu.currentTurnId;

    const update: Partial<PenduState> = {
      guessedLetters: newGuessed,
      maskedWord: newMasked,
      wrongLetters: newWrong,
      playerStates: newStates,
      currentTurnId: nextTurn,
      phase,
      winnerId,
    };

    updatePendu(update);
    if (!isSolo) broadcast({ type: 'PENDU_UPDATE', payload: update });
  }, [isMyTurn, pendu, isChooser, isSolo, myState, myId, broadcast, updatePendu, getNextPlayer, showNotif]);

  /* ─── Tenter un mot ─── */
  const guessWord = useCallback(() => {
    if (pendu.phase !== 'PLAYING') return;
    if (!isSolo && (!isMyTurn || isChooser)) return;
    if (myState?.eliminated) return;
    if (!wordGuess.trim()) return;

    const guess = normalize(wordGuess.trim());
    const wordNorm = normalize(pendu.word);

    let newStates = pendu.playerStates.map(ps => ({ ...ps }));
    const meIdx = newStates.findIndex(ps => ps.playerId === myId);

    if (guess === wordNorm) {
      const newMasked = pendu.word.split('');
      const update: Partial<PenduState> = {
        maskedWord: newMasked,
        phase: 'ROUND_WON',
        winnerId: myId,
      };
      updatePendu(update);
      if (!isSolo) broadcast({ type: 'PENDU_UPDATE', payload: update });
      showNotif('🎉 Mot trouvé !');
    } else {
      if (meIdx >= 0) {
        newStates[meIdx].wordAttempts += 1;
        if (newStates[meIdx].wordAttempts >= MAX_WORD_ATTEMPTS) {
          newStates[meIdx].eliminated = true;
          showNotif('💀 Éliminé par trop de tentatives de mot !');
        } else {
          showNotif('❌ Mauvais mot !');
        }
      }

      const remainingActive = newStates.filter(ps => !ps.eliminated && ps.playerId !== pendu.chooserId);
      let phase: PenduState['phase'] = 'PLAYING';

      if (remainingActive.length === 0) {
        phase = 'ROUND_LOST';
        showNotif('😵 Tous les joueurs sont éliminés !');
      }

      const nextTurn = (phase === 'PLAYING')
        ? (isSolo ? myId : getNextPlayer(myId, newStates))
        : pendu.currentTurnId;

      const update: Partial<PenduState> = {
        playerStates: newStates,
        currentTurnId: nextTurn,
        phase,
      };

      updatePendu(update);
      if (!isSolo) broadcast({ type: 'PENDU_UPDATE', payload: update });
    }

    setWordGuess('');
  }, [isMyTurn, pendu, isChooser, isSolo, myState, myId, wordGuess, broadcast, updatePendu, getNextPlayer, showNotif]);

  const backToHub = () => {
    useGameStore.getState().resetPendu();
    useGameStore.getState().setCurrentGame('HUB');
    broadcast({ type: 'CHANGE_GAME', game: 'HUB' });
  };

  const nextRound = useCallback((difficulty: 'facile' | 'moyen' | 'difficile') => {
    const wordList = wordsData[difficulty];
    const randomWord = wordList[Math.floor(Math.random() * wordList.length)];

    const playersForGame = isSolo
      ? [{ id: myId, name: store.myName || `Joueur_${myId.slice(0, 5)}` }]
      : allPlayers;

    const playerStates: PenduPlayerState[] = playersForGame.map(p => ({
      playerId: p.id,
      mistakes: 0,
      wordAttempts: 0,
      eliminated: false,
    }));

    const chooser = isSolo ? '' : (pendu.winnerId || pickRandomPlayer());
    const firstPlayer = isSolo ? myId : (playersForGame.find(p => p.id !== chooser)?.id || chooser);

    const newState: Partial<PenduState> = {
      word: normalize(randomWord),
      maskedWord: normalize(randomWord).split('').map(() => '_'),
      guessedLetters: [],
      wrongLetters: [],
      phase: 'PLAYING',
      difficulty,
      chooserId: chooser,
      currentTurnId: firstPlayer,
      playerStates,
      winnerId: '',
      roundNumber: (pendu.roundNumber || 0) + 1,
    };

    updatePendu(newState);
    if (!isSolo) broadcast({ type: 'PENDU_UPDATE', payload: newState });
  }, [allPlayers, isSolo, myId, store.myName, pendu.winnerId, pendu.roundNumber, broadcast, updatePendu, pickRandomPlayer]);

  /* ─── Nom d'un joueur ─── */
  const getPlayerName = (id: string) => {
    if (id === myId) return store.myName || `Joueur_${myId.slice(0, 5)}`;
    const p = players.find(pl => pl.id === id);
    return p?.name || `Joueur_${id.slice(0, 5)}`;
  };

  const canLaunch = isHost || isSolo || pendu.hostId === '';


  if (pendu.phase === 'LOBBY') {
    const versusDisabled = allPlayers.length < 2;

    return (
      <div className="pendu-page">
      <Navbar activePage="Pendu" />
      <div className="pendu-container">
        <h1 className="pendu-title">🎯 Jeu du Pendu</h1>

        <div className="pendu-section" style={{ marginBottom: '18px' }}>
          <h3 className="pendu-section-title">ID de la Room</h3>
          <p
            className="pendu-room-id"
            onClick={() => { if (myId) navigator.clipboard.writeText(myId); showNotif('📋 ID copié !'); }}
            title="Cliquer pour copier"
          >
            {myId || '...'}
          </p>
          <p className="pendu-room-hint">Clique pour copier et partager avec tes amis</p>
        </div>

        <p className="pendu-lobby-players-label">
          Joueurs connectés : {allPlayers.length}
        </p>
        <div className="pendu-lobby-players-row">
          {allPlayers.map(p => (
            <span key={p.id} className="pendu-player-badge">
              {p.name} {p.id === myId ? '(toi)' : ''}
            </span>
          ))}
        </div>

        <div className="pendu-section">
          <h3 className="pendu-section-title">Mode de jeu</h3>
          <div className="pendu-lobby-mode-row">
            <button
              onClick={() => setLobbyMode('solo')}
              className={`pendu-mode-btn pendu-mode-btn-solo ${lobbyMode === 'solo' ? 'active' : ''}`}
            >
              🧑 SOLO
            </button>
            <button
              onClick={() => !versusDisabled && setLobbyMode('versus')}
              disabled={versusDisabled}
              title={versusDisabled ? 'Il faut au moins 2 joueurs pour le mode Versus' : ''}
              className={`pendu-mode-btn pendu-mode-btn-versus ${lobbyMode === 'versus' ? 'active' : ''} ${versusDisabled ? 'disabled' : ''}`}
            >
              ⚔️ VERSUS
            </button>
          </div>
          {versusDisabled && (
            <p className="pendu-lobby-versus-warn">
              Connecte des amis pour jouer en Versus
            </p>
          )}
        </div>

        <div className="pendu-section">
          <h3 className="pendu-section-title">Difficulté</h3>
          <div className="pendu-lobby-diff-row">
            {(['facile', 'moyen', 'difficile'] as const).map(diff => {
              const active = lobbyDifficulty === diff;
              return (
                <button
                  key={diff}
                  onClick={() => setLobbyDifficulty(diff)}
                  className={`pendu-mode-btn pendu-diff-btn ${active ? `active-${diff}` : ''}`}
                >
                  {diff.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => launchGame(lobbyDifficulty, lobbyMode)}
          className="pendu-launch-btn"
        >
          🚀 LANCER LA PARTIE
        </button>

        <button onClick={backToHub} className="pendu-btn pendu-back-btn">
          ⬅ Retour au Hub
        </button>

        <div className="pendu-lobby-chat">
          <ChatRoom />
        </div>
      </div>
      </div>
    );
  }


  if (pendu.phase === 'ROUND_WON' || pendu.phase === 'ROUND_LOST') {
    const isWinner = pendu.winnerId === myId;
    const canRelaunch = isSolo || isWinner || (pendu.phase === 'ROUND_LOST' && (isHost || allPlayers[0]?.id === myId));

    return (
      <div className="pendu-page">
      <Navbar activePage="Pendu" />
      <div className="pendu-container">
        <h1 className="pendu-title">
          {pendu.phase === 'ROUND_WON' ? '🎉 Mot Trouvé !' : '😵 Tous Éliminés !'}
        </h1>
        <p className="pendu-result-word">
          {pendu.word}
        </p>
        {pendu.phase === 'ROUND_WON' && !isSolo && (
          <p className="pendu-result-winner">
            Gagnant : {getPlayerName(pendu.winnerId)}
          </p>
        )}

        {canRelaunch && (
          <div className="pendu-result-actions">
            <h3 className="pendu-result-diff-title">Prochain round — Difficulté :</h3>
            <div className="pendu-result-diff-row">
              {(['facile', 'moyen', 'difficile'] as const).map(diff => (
                <button
                  key={diff}
                  onClick={() => nextRound(diff)}
                  className={`pendu-btn pendu-diff-btn active-${diff}`}
                >
                  {diff.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        <button onClick={backToHub} className="pendu-btn pendu-back-btn-result">
          ⬅ Retour au Hub
        </button>

        <div className="pendu-lobby-chat">
          <ChatRoom />
        </div>
      </div>
      </div>
    );
  }


  const canPlay = isSolo || (isMyTurn && !isChooser && !(myState?.eliminated));

  return (
    <div className="pendu-page">
    <Navbar activePage="Pendu" />
    <div className="pendu-container">
      {notification && (
        <div className="pendu-notification">{notification}</div>
      )}

      <div className="pendu-play-layout">
        {/* ─── Panneau principal ─── */}
        <div className="pendu-play-main">
          <h1 className="pendu-title pendu-title-play">
            🎯 Pendu — Round {pendu.roundNumber}
            <span className="pendu-play-subtitle">
              ({pendu.difficulty} • {isSolo ? 'Solo' : 'Versus'})
            </span>
          </h1>

          {/* Mot masqué */}
          <div className="pendu-word-display">
            {pendu.maskedWord.map((ch, i) => (
              <span key={i} className="pendu-letter-box">
                {ch === '_' ? '\u00A0' : ch}
                <div className="pendu-letter-underline" />
              </span>
            ))}
          </div>

          {/* Info tour */}
          <div className="pendu-turn-info">
            {isSolo ? (
              <p className="pendu-turn-solo">
                À toi de jouer !
              </p>
            ) : isChooser ? (
              <p className="pendu-turn-chooser">🔒 Tu as choisi le mot. Observe la partie !</p>
            ) : isMyTurn ? (
              <p className="pendu-turn-myturn">
                 C'est ton tour !
              </p>
            ) : (
              <p className="pendu-turn-waiting">
                ⏳ Tour de : <strong className="pendu-turn-name">{getPlayerName(pendu.currentTurnId)}</strong>
              </p>
            )}
          </div>

          <div className="pendu-keyboard">
            {ALPHABET.map(letter => {
              const isGuessed = pendu.guessedLetters.includes(letter);
              const isWrong = pendu.wrongLetters.includes(letter);
              const isCorrect = isGuessed && !isWrong;

              return (
                <button
                  key={letter}
                  disabled={isGuessed || !canPlay}
                  onClick={() => guessLetter(letter)}
                  className={`pendu-key-btn ${isWrong ? 'key-wrong' : isCorrect ? 'key-correct' : isGuessed ? 'key-used' : 'key-default'} ${!canPlay ? 'key-disabled' : ''}`}
                >
                  {letter}
                </button>
              );
            })}
          </div>

          {canPlay && (
            <div className="pendu-guess-row">
              <input
                value={wordGuess}
                onChange={e => setWordGuess(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && guessWord()}
                placeholder="Tenter un mot..."
                className="pendu-input"
              />
              <button onClick={guessWord} className="pendu-btn pendu-guess-btn">
                TENTER
              </button>
            </div>
          )}

          <div className="pendu-players-section">
            <h3 className="pendu-players-title">
              {isSolo ? 'Ton état' : 'Joueurs'}
            </h3>
            <div className="pendu-players-grid">
              {pendu.playerStates.map(ps => {
                const isCurrent = ps.playerId === pendu.currentTurnId;
                const isMe = ps.playerId === myId;
                const isChooserP = ps.playerId === pendu.chooserId && !isSolo;
                return (
                  <div
                    key={ps.playerId}
                    className={`pendu-player-card ${ps.eliminated ? 'card-eliminated' : isCurrent ? 'card-active' : ''}`}
                  >
                    <div className={`pendu-player-info-name ${isMe ? 'pendu-player-name-me' : 'pendu-player-name-other'}`}>
                      {getPlayerName(ps.playerId)}
                      {isMe ? ' (toi)' : ''}
                      {isChooserP ? ' 🔒' : ''}
                    </div>
                    {!isChooserP && (
                      <>
                        <div className="pendu-player-stat-row">
                          <span className="pendu-mistakes-label">Lettres:</span>
                          {Array.from({ length: MAX_MISTAKES }).map((_, i) => (
                            <span key={i}>
                              {i < ps.mistakes ? <CrossIcon size={18} /> : <span className="pendu-mistake-slot" />}
                            </span>
                          ))}
                        </div>
                        <div className="pendu-player-stat-row-words">
                          <span className="pendu-mistakes-label">Mots:</span>
                          {Array.from({ length: MAX_WORD_ATTEMPTS }).map((_, i) => (
                            <span key={i}>
                              {i < ps.wordAttempts ? <SkullIcon size={20} /> : <span className="pendu-word-slot" />}
                            </span>
                          ))}
                        </div>
                        {ps.eliminated && (
                          <span className="pendu-eliminated-tag">ÉLIMINÉ</span>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={backToHub} className="pendu-btn pendu-back-btn">
            ⬅ Retour au Hub
          </button>
        </div>

        <div className="pendu-play-chat">
          <ChatRoom />
        </div>
      </div>
    </div>
    </div>
  );
}
