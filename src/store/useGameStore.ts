import { create } from 'zustand';

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface PenduPlayerState {
  playerId: string;
  mistakes: number;          // nombre de lettres loupées (max 5)
  wordAttempts: number;      // nombre de tentatives de mot loupées (max 3)
  eliminated: boolean;
}

export interface PenduState {
  word: string;
  maskedWord: string[];
  guessedLetters: string[];
  wrongLetters: string[];
  phase: 'LOBBY' | 'CHOOSING' | 'PLAYING' | 'ROUND_WON' | 'ROUND_LOST' | 'GAME_OVER';
  mode: 'solo' | 'versus';
  difficulty: 'facile' | 'moyen' | 'difficile';
  hostId: string;            // joueur qui a créé la room
  chooserId: string;         // joueur qui a choisi le mot
  currentTurnId: string;     // joueur dont c'est le tour
  playerStates: PenduPlayerState[];
  winnerId: string;
  roundNumber: number;
}

export interface GameState {
  myId: string;
  myName: string;
  roomCode: string;
  players: Player[];
  currentGame: 'HUB' | 'PENDU';
  chatMessages: ChatMessage[];

  pendu: PenduState;

  setMyId: (id: string) => void;
  setMyName: (name: string) => void;
  setRoomCode: (code: string) => void;
  addPlayer: (player: Player) => void;
  removePlayer: (id: string) => void;
  setCurrentGame: (game: 'HUB' | 'PENDU') => void;
  updatePendu: (data: Partial<PenduState>) => void;
  resetPendu: () => void;
  addChatMessage: (msg: ChatMessage) => void;
  clearChat: () => void;
}

const defaultPendu: PenduState = {
  word: '',
  maskedWord: [],
  guessedLetters: [],
  wrongLetters: [],
  phase: 'LOBBY',
  mode: 'solo',
  difficulty: 'facile',
  hostId: '',
  chooserId: '',
  currentTurnId: '',
  playerStates: [],
  winnerId: '',
  roundNumber: 0,
};

export const useGameStore = create<GameState>((set) => ({
  myId: '',
  myName: localStorage.getItem('jsmg_myName') || '',
  roomCode: '',
  players: [],
  currentGame: 'HUB',
  chatMessages: [],

  pendu: { ...defaultPendu },

  setMyId: (id) => set({ myId: id }),

  setMyName: (name) => {
    localStorage.setItem('jsmg_myName', name);
    return set({ myName: name });
  },

  setRoomCode: (code) => set({ roomCode: code }),

  addPlayer: (player) => set((state) => ({
    players: [...state.players.filter(p => p.id !== player.id), player]
  })),

  removePlayer: (id) => set((state) => ({
    players: state.players.filter((p) => p.id !== id)
  })),

  setCurrentGame: (game) => set({ currentGame: game }),

  updatePendu: (data) => set((state) => ({
    pendu: { ...state.pendu, ...data }
  })),

  resetPendu: () => set({ pendu: { ...defaultPendu } }),

  addChatMessage: (msg) => set((state) => ({
    chatMessages: [...state.chatMessages.slice(-99), msg]
  })),

  clearChat: () => set({ chatMessages: [] }),
}));