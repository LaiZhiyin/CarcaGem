import React, { useState } from 'react';
import { getAnimalIdFromAvatar, getAnimalNicknameFromAvatar, getPlayerAvatarForColor, getPlayerAvatarScale, getRandomUniquePlayerAvatars } from '../utils/playerAvatars';

interface PlayerSetup {
  name: string;
  placeholderName: string;
  color: string;
  colorName: string;
  isAI: boolean;
  meepleImg: string;
  avatarImg: string;
}

const AVAILABLE_COLORS = [
  { name: 'Red', color: '#e74c3c', key: 'red', img: '/workers/take-point-red.png?v=1.0.4' },
  { name: 'Yellow', color: '#f1c40f', key: 'yellow', img: '/workers/take-point-yellow.png?v=1.0.4' },
  { name: 'Green', color: '#2ecc71', key: 'green', img: '/workers/take-point-green.png?v=1.0.4' },
  { name: 'Blue', color: '#3498db', key: 'blue', img: '/workers/take-point-blue.png?v=1.0.4' },
];

interface GameSetupProps {
  onStart: (players: { name: string; color: string; isAI: boolean; meepleImg: string; avatarImg: string }[]) => void;
  onBack: () => void;
}

const GameSetup: React.FC<GameSetupProps> = ({ onStart, onBack }) => {
  const [playerCount, setPlayerCount] = useState(2);
  const [players, setPlayers] = useState<PlayerSetup[]>(() => {
    const avatars = getRandomUniquePlayerAvatars(['red', 'blue', 'green']);
    return [
      { name: '', placeholderName: getAnimalNicknameFromAvatar(avatars[0]), color: '#e74c3c', colorName: 'red', isAI: false, meepleImg: '/workers/take-point-red.png?v=1.0.4', avatarImg: avatars[0] },
      { name: '', placeholderName: getAnimalNicknameFromAvatar(avatars[1]), color: '#3498db', colorName: 'blue', isAI: true, meepleImg: '/workers/take-point-blue.png?v=1.0.4', avatarImg: avatars[1] },
      { name: '', placeholderName: getAnimalNicknameFromAvatar(avatars[2]), color: '#2ecc71', colorName: 'green', isAI: true, meepleImg: '/workers/take-point-green.png?v=1.0.4', avatarImg: avatars[2] },
    ];
  });

  const updatePlayer = (index: number, updates: Partial<PlayerSetup>) => {
    setPlayers(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const setPlayerColor = (index: number, colorInfo: typeof AVAILABLE_COLORS[0]) => {

    const isUsed = players.some((p, i) => i !== index && i < playerCount && p.colorName === colorInfo.key);
    if (isUsed) return;

    const usedAnimalIds = players
      .filter((_, playerIndex) => playerIndex !== index)
      .map(player => getAnimalIdFromAvatar(player.avatarImg))
      .filter((animalId): animalId is string => Boolean(animalId));

    updatePlayer(index, {
      color: colorInfo.color,
      colorName: colorInfo.key,
      meepleImg: colorInfo.img,
      avatarImg: getPlayerAvatarForColor(players[index].avatarImg, colorInfo.key, usedAnimalIds),
    });
  };

  const handleStart = () => {
    const activePlayers = players.slice(0, playerCount).map(p => ({
      name: p.name.trim() || p.placeholderName,
      color: p.color,
      isAI: p.isAI,
      meepleImg: p.meepleImg,
      avatarImg: p.avatarImg,
    }));
    onStart(activePlayers);
  };

  return (
    <div className="setup-overlay">
      <div className="setup-container">

        <div className="setup-header">
          <h1 className="setup-title">Local Game</h1>
          <p className="setup-subtitle-visible">Play against AI or take turns with friends on one device.</p>
        </div>

        <div className="setup-section">
          <div className="setup-label">Players</div>
          <div className="setup-player-count">
            {[2, 3].map(n => (
              <button
                key={n}
                className={`count-btn ${playerCount === n ? 'active' : ''}`}
                onClick={() => setPlayerCount(n)}
              >
                {n} Players
              </button>
            ))}
          </div>
        </div>

        <div className="setup-section local-player-setup">
          <div className="setup-label">Player Setup</div>
          <div className="setup-players">
            {players.slice(0, playerCount).map((player, index) => (
              <div key={index} className="setup-player-card" style={{ borderColor: player.color }}>
                <div className="spc-header">
                  <div className="spc-avatar-frame" style={{ borderColor: player.color, background: `linear-gradient(135deg, ${player.color}22, ${player.color}44)` }}>
                    <img
                      src={player.avatarImg}
                      alt="avatar"
                      className="spc-avatar"
                      style={{ width: `${getPlayerAvatarScale(player.avatarImg)}%`, height: `${getPlayerAvatarScale(player.avatarImg)}%` }}
                    />
                  </div>
                  <input
                    className="spc-name-input"
                    value={player.name}
                    placeholder={player.placeholderName}
                    onChange={(e) => updatePlayer(index, { name: e.target.value })}
                    maxLength={10}
                  />
                </div>
                <div className="spc-controls-row">
                  <div className="spc-colors shifted-colors">
                    {AVAILABLE_COLORS.map(c => {
                      const isUsed = players.some((p, i) => i !== index && i < playerCount && p.colorName === c.key);
                      return (
                        <button
                          type="button"
                          key={c.key}
                          className={`color-option ${player.colorName === c.key ? 'selected' : ''} ${isUsed ? 'disabled' : ''}`}
                          style={{ backgroundColor: c.color }}
                          onClick={() => setPlayerColor(index, c)}
                          disabled={isUsed}
                          aria-label={`${c.name}${player.colorName === c.key ? ', selected color' : ''}`}
                          title={isUsed ? 'Already in use' : c.name}
                        >
                          {player.colorName === c.key && <span className="color-check">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="spc-type-toggle">
                    <button
                      className={`type-btn ${!player.isAI ? 'active' : ''}`}
                      onClick={() => updatePlayer(index, { isAI: false })}
                    >
                      Human
                    </button>
                    <button
                      className={`type-btn ${player.isAI ? 'active' : ''}`}
                      onClick={() => updatePlayer(index, { isAI: true })}
                    >
                      AI
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="online-actions">
          <button className="setup-start-btn" onClick={handleStart}>
            Start Game
          </button>
          <button className="back-home-link" onClick={onBack}>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default GameSetup;
