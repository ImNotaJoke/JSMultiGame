import { useState } from 'react';
import './GameCard.css';

interface GameCardProps {
  title: string;
  imagePath: string;
  onCreate: () => void;
}

export default function GameCard({ title, imagePath, onCreate }: GameCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`gamecard-wrapper ${isHovered ? 'hovered' : ''}`}
      onClick={onCreate}
    >
      <img
        src={imagePath}
        alt={title}
        className={`gamecard-img ${isHovered ? 'zoomed' : ''}`}
      />

      <div className="gamecard-overlay">
        <h3 className="gamecard-title">{title}</h3>
        {isHovered && (
          <button
            onClick={(e) => { e.stopPropagation(); onCreate(); }}
            className="gamecard-btn-create"
          >
            JOUER
          </button>
        )}
      </div>
    </div>
  );
}