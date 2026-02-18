import { useGameStore } from './store/useGameStore';
import { usePeerInit } from './hooks/usePeer';
import HubMenu from './components/common/HubMenu';
import Pendu from './games/pendu/Pendu';
import './App.css';

export default function App() {
  const { currentGame } = useGameStore();
  usePeerInit();

  return (
    <div className="app-root">
      {currentGame === 'HUB' && <HubMenu />}
      {currentGame === 'PENDU' && <Pendu />}
    </div>
  );
}