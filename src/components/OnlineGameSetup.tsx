import { trackScreen, trackEvent } from '../analytics/client';
import { VERSION } from '../version';
import React, { useState, useEffect, useRef } from 'react';
import {
  configureBot, onRoomEvent, onPresenceChange, joinRoomChannel, broadcast,
  leaveRoom, updatePresence, signInAsGuest, generateRoomCode,
  sessionState, type PlayerSlot, type OnlineGameEvent
} from '../network';
import {
  getAnimalIdFromAvatar,
  getAnimalNicknameFromAvatar,
  getPlayerAvatarForColor,
  getPlayerAvatarScale,
  getPlayerAvatarForUser,
  getRandomPlayerAvatar,
} from '../utils/playerAvatars';

interface OnlineGameSetupProps {
  onBack: () => void;
  onStart: (playerConfigs: any[], seed?: number) => void;
}

type OnlineStep = 'entry' | 'joining' | 'waiting';

const AVAILABLE_COLORS = [
  { name: 'Red', color: '#e74c3c', key: 'red', img: '/workers/take-point-red.png?v=1.0.4' },
  { name: 'Yellow', color: '#f1c40f', key: 'yellow', img: '/workers/take-point-yellow.png?v=1.0.4' },
  { name: 'Green', color: '#2ecc71', key: 'green', img: '/workers/take-point-green.png?v=1.0.4' },
  { name: 'Blue', color: '#3498db', key: 'blue', img: '/workers/take-point-blue.png?v=1.0.4' },
];

const OnlineGameSetup: React.FC<OnlineGameSetupProps> = ({ onBack, onStart }) => {
  const [step, setStep] = useState<OnlineStep>('entry');
  const [nickname, setNickname] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [roomPlayers, setRoomPlayers] = useState<PlayerSlot[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [guestAvatar] = useState(() => {
    const avatarImg = getRandomPlayerAvatar(AVAILABLE_COLORS[0].key);
    return { avatarImg, nickname: getAnimalNicknameFromAvatar(avatarImg) };
  });
  const placeholderName = guestAvatar.nickname;

  const hasStartedRef = useRef(false);
  useEffect(() => {
    if ((step === 'waiting' || step === 'joining') && roomPlayers.some(p => p.userId === sessionState.userId)) trackScreen('room', VERSION);
  }, [step, roomPlayers]);

  const setOnlineSeatType = async (isAI: boolean, player?: PlayerSlot) => {
    if (!sessionState.isHost) return;
    if (isAI && !player) {
      const result = await configureBot('add');
      if (result.error) alert(result.error);
    } else if (!isAI && player?.isAI) {
      const result = await configureBot('remove', player.userId);
      if (result.error) alert(result.error);
    }
  };

  const renderSeatTypeToggle = (isAI: boolean, onSelect: (nextIsAI: boolean) => void) => (
    <div className="spc-type-toggle online-seat-type-toggle" role="group" aria-label="Seat type">
      <button
        type="button"
        className={`type-btn ${!isAI ? 'active' : ''}`}
        aria-pressed={!isAI}
        onClick={() => onSelect(false)}
      >Human</button>
      <button
        type="button"
        className={`type-btn ${isAI ? 'active' : ''}`}
        aria-pressed={isAI}
        onClick={() => onSelect(true)}
      >AI</button>
    </div>
  );

  useEffect(() => {

    if (step === 'waiting' || step === 'joining') {
      console.log('OnlineGameSetup: Starting network listeners for step:', step);

      const unsubscribePresence = onPresenceChange((members) => {
        console.log('OnlineGameSetup: Presence change detected:', members);

        const sorted = [...members].sort((a, b) => {
          if (a.isHost && !b.isHost) return -1;
          if (!a.isHost && b.isHost) return 1;
          return (a.joinedAt ?? 0) - (b.joinedAt ?? 0);
        });
        setRoomPlayers(sorted);

          const meIndex = sorted.findIndex(m => m.userId === sessionState.userId);
          const me = sorted[meIndex];
          if (me) {
            let updated = false;
            const newPresence: any = {};
            const priorAnimalIds = sorted
              .slice(0, meIndex)
              .map(player => getAnimalIdFromAvatar(player.avatarImg))
              .filter((animalId): animalId is string => Boolean(animalId));

            if (!me.colorKey && !me.isHost) {
              const usedColorKeys = new Set(sorted.map(m => (m as any).colorKey));
              const available = AVAILABLE_COLORS.find(c => !usedColorKeys.has(c.key));
              if (available) {
                newPresence.color = available.color;
                newPresence.colorKey = available.key;
                updated = true;
              }
            }

            const assignedColorKey = newPresence.colorKey || (me as any).colorKey || AVAILABLE_COLORS.find(c => c.color === me.color)?.key;
            const currentAnimalId = getAnimalIdFromAvatar(me.avatarImg);
            if (assignedColorKey && (!currentAnimalId || priorAnimalIds.includes(currentAnimalId))) {
              newPresence.avatarImg = getPlayerAvatarForColor(me.avatarImg, assignedColorKey, priorAnimalIds);
              if (sessionState.displayName === placeholderName) {
                newPresence.displayName = getAnimalNicknameFromAvatar(newPresence.avatarImg);
                sessionState.displayName = newPresence.displayName;
              }
              updated = true;
            }

            let currentName = sessionState.displayName;
            if (!me.isHost) {
              const otherNames = new Set(sorted.filter(m => m.userId !== me.userId).map(m => m.displayName));
              if (otherNames.has(currentName)) {
                let i = 1;
                while (otherNames.has(`${sessionState.displayName}(${i})`)) {
                  i++;
                }
                currentName = `${sessionState.displayName}(${i})`;
                newPresence.displayName = currentName;
                sessionState.displayName = currentName;
                updated = true;
              }
            }

            if (updated) {
              updatePresence(newPresence);
            }
          }
      });

      const unsubscribeRoomEvent = onRoomEvent((event: OnlineGameEvent) => {
        console.log('OnlineGameSetup: Room event received:', event);
        if (event.type === 'GAME_START') {
          const { seed, players } = event.payload;
          const configs = players.map((p: any) => {
            const colorInfo = AVAILABLE_COLORS.find(c => c.key === p.colorKey) || AVAILABLE_COLORS[0];
            return {
              userId: p.userId,
              name: p.displayName,
              color: colorInfo.color,
              isAI: Boolean(p.isAI),
              avatarImg: p.avatarImg || getPlayerAvatarForUser(p.userId, p.colorKey),
              meepleImg: colorInfo.img
            };
          });
          hasStartedRef.current = true;
          onStart(configs, seed);
        }
      });

      return () => {
        console.log('OnlineGameSetup: Cleaning up network listeners');
        unsubscribePresence();
        unsubscribeRoomEvent();
      };
    }
  }, [step, onStart]);

  const handleCreateRoom = async () => {
    try {
      const finalName = nickname.trim() || placeholderName;
      const connected = await signInAsGuest(finalName);
      if (!connected) throw new Error('Could not connect to the game server.');
      const code = generateRoomCode();
      sessionState.isHost = true;
      sessionState.displayName = finalName;
      setInviteCode(code);

      const res = await joinRoomChannel(code);
      if (res.error) {
        alert(res.error);
        return;
      }

      await updatePresence({
        ready: true,
        displayName: finalName,
        isHost: true,
        color: AVAILABLE_COLORS[0].color,
        colorKey: AVAILABLE_COLORS[0].key,
        avatarImg: guestAvatar.avatarImg
      } as any);
      setStep('waiting');
    } catch (error) {
      console.error('Create room error:', error);
      alert('Could not create the room. Please try again.');
    }
  };

  const handleJoinInit = () => {
    setStep('joining');
  };

  const handleConfirmJoin = async () => {
    if (inviteCode.length === 5) {
      try {
        const finalName = nickname.trim() || placeholderName;
        const connected = await signInAsGuest(finalName);
        if (!connected) throw new Error('Could not connect to the game server.');
        sessionState.isHost = false;
        sessionState.displayName = finalName;
        const res = await joinRoomChannel(inviteCode);
        if (res.error) {
          alert(res.error);
          setInviteCode('');
          return;
        }
        await updatePresence({ ready: false, displayName: sessionState.displayName, isHost: false });
      } catch (error) {
        console.error('Join room error:', error);
        alert('Could not join the room. Check your connection and invite code, then try again.');
      }
    } else {
      alert('Enter the 5-digit invite code.');
    }
  };

  const copyInviteCode = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(inviteCode);
      trackEvent('invite_code_copied');
      alert('Invite code copied.');
    } catch {
      alert(`Copy this invite code: ${inviteCode}`);
    }
  };

  const toggleReady = async () => {
    const nextReady = !isReady;
    setIsReady(nextReady);
    await updatePresence({ ready: nextReady } as any);
  };

  const handleSelectColor = async (colorKey: string) => {
    const colorInfo = AVAILABLE_COLORS.find(c => c.key === colorKey);
    if (!colorInfo) return;

    const isUsed = roomPlayers.some(p => p.userId !== sessionState.userId && (p as any).colorKey === colorKey);
    if (isUsed) return;

    const currentPlayer = roomPlayers.find(player => player.userId === sessionState.userId);
    const usedAnimalIds = roomPlayers
      .filter(player => player.userId !== sessionState.userId)
      .map(player => getAnimalIdFromAvatar(player.avatarImg))
      .filter((animalId): animalId is string => Boolean(animalId));

    await updatePresence({
      color: colorInfo.color,
      colorKey: colorKey,
      avatarImg: getPlayerAvatarForColor(currentPlayer?.avatarImg, colorKey, usedAnimalIds)
    } as any);
  };

  const startGame = async () => {
    if (sessionState.isHost) {
      if (roomPlayers.length < 2) {
        alert('At least 2 players are required to start.');
        return;
      }
      const allReady = roomPlayers.every(p => p.ready || p.isHost);
      if (!allReady) {
        alert('Some players are not ready yet.');
        return;
      }

      const seed = Math.floor(Math.random() * 1000000);
      const usedAnimalIds: string[] = [];
      const players = roomPlayers.map((p, i) => {
        const colorKey = (p as any).colorKey || 'red';
        const avatarImg = getPlayerAvatarForColor(
          p.avatarImg || getPlayerAvatarForUser(p.userId, colorKey),
          colorKey,
          usedAnimalIds
        );
        const animalId = getAnimalIdFromAvatar(avatarImg);
        if (animalId) usedAnimalIds.push(animalId);
        return {
          id: i + 1,
          userId: p.userId,
          displayName: p.displayName,
          colorKey,
          isAI: Boolean(p.isAI),
          avatarImg
        };
      });

      await broadcast({
        type: 'GAME_START',
        payload: { seed, players, hostId: sessionState.userId }
      });
    }
  };

  if (step === 'entry') {
    return (
      <div className="setup-overlay">
        <div className="setup-container online-setup">
          <div className="setup-header">
            <h2 className="setup-title">Online Game</h2>
            <p className="setup-subtitle-visible">Create a room and play with friends online.</p>
          </div>

          <div className="setup-section online-nickname-section">
            <div className="setup-label">Nickname</div>
            <input
              type="text"
              className="spc-name-input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={10}
              placeholder={placeholderName}
              autoFocus
            />
          </div>

          <div className="online-actions horizontal-actions">
            <button className="setup-start-btn" onClick={handleCreateRoom}>
              Create Room
            </button>
            <button className="setup-start-btn join-btn" onClick={handleJoinInit}>
              Join Room
            </button>
          </div>

          <button className="back-home-link" onClick={onBack}>Back to Home</button>
        </div>
      </div>
    );
  }

  let displayPlayers = [...roomPlayers];
  if (sessionState.isHost && !displayPlayers.some(p => p.userId === sessionState.userId)) {
    displayPlayers.unshift({
      userId: sessionState.userId,
      displayName: sessionState.displayName,
      isHost: true,
      ready: true,
      colorKey: AVAILABLE_COLORS[0].key,
      color: AVAILABLE_COLORS[0].color
    } as any);
  }

  if (step === 'joining') {
    const isConnected = displayPlayers.some(p => p.userId === sessionState.userId);

    return (
      <div className="setup-overlay">
        <div className="setup-container waiting-room">
          <div className="setup-header">
            <h2 className="setup-title">Join a Room</h2>
          </div>

          <div className="setup-section invite-confirm-section">
            <div className="invite-code-box join-input-box">
              <span className="invite-label">Invite Code:</span>
              <input
                type="text"
                className="invite-value join-input-field"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                title="Invite code"
                disabled={isConnected}
                autoFocus
              />
              {!isConnected && (
                <button className="copy-btn join-confirm-btn" onClick={handleConfirmJoin}>
                   Join
                </button>
              )}
            </div>
          </div>

          <div className="setup-section">
            <label className="setup-label">Players ({displayPlayers.length}/3)</label>
            <div className="waiting-players">
              {Array.from({ length: 3 }).map((_, index) => {
                const player = displayPlayers[index];
                return (
                  <div key={index} className={`waiting-player-item ${player ? '' : 'empty'}`}>
                    {player ? (
                      <>
                        <div className="wp-info">
                          <div className="wp-avatar-frame" style={{ borderColor: player.color || '#94a3b8' }}>
                            <img
                              className="wp-avatar"
                              src={player.avatarImg || getPlayerAvatarForUser(player.userId, (player as any).colorKey)}
                              alt={`${player.displayName}'s avatar`}
                              style={{
                                width: `${getPlayerAvatarScale(player.avatarImg || getPlayerAvatarForUser(player.userId, (player as any).colorKey))}%`,
                                height: `${getPlayerAvatarScale(player.avatarImg || getPlayerAvatarForUser(player.userId, (player as any).colorKey))}%`,
                              }}
                            />
                          </div>
                          <span className="wp-name">
                            {index + 1}. {player.displayName} {player.userId === sessionState.userId && '(You)'}
                            {player.isHost && ' 👑'}
                            {player.isAI && <span> · AI</span>}
                          </span>
                        </div>
                        <div className="wp-right">
                          <div className="wp-color-selector">
                             {AVAILABLE_COLORS.map(c => {
                               const isOccupied = displayPlayers.some(p => p.userId !== player.userId && (p as any).colorKey === c.key);
                               const isSelected = (player as any).colorKey === c.key;
                               return (
                                 <button
                                   type="button"
                                   key={c.key}
                                   className={`wp-color-dot ${isSelected ? 'active' : ''} ${isOccupied ? 'disabled' : ''}`}
                                   style={{ backgroundColor: c.color }}
                                   onClick={() => player.userId === sessionState.userId && !isOccupied && void handleSelectColor(c.key)}
                                   disabled={player.userId !== sessionState.userId || isOccupied}
                                   aria-label={`${c.name}${isSelected ? ', selected color' : ''}`}
                                   title={isOccupied ? 'Already in use' : c.name}
                                 />
                               );
                             })}
                          </div>
                          <span className={`wp-status ${player.ready ? 'ready' : ''}`}>
                            {player.ready ? 'Ready' : 'Not Ready'}
                          </span>
                          {player.isAI && sessionState.isHost && renderSeatTypeToggle(true, (nextIsAI) => {
                            if (!nextIsAI) void setOnlineSeatType(false, player);
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="wp-placeholder">
                        <span>Waiting for players...</span>
                        {sessionState.isHost && renderSeatTypeToggle(false, (nextIsAI) => {
                          if (nextIsAI) void setOnlineSeatType(true);
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="online-actions waiting-actions">
            <button className="setup-start-btn" onClick={toggleReady} disabled={!isConnected}>
              {isReady ? 'Cancel Ready' : 'Ready'}
            </button>
            <button className="setup-start-btn back-btn" onClick={() => { leaveRoom(); setStep('entry'); setInviteCode(''); setIsReady(false); }}>
               Leave Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-overlay">
      <div className="setup-container waiting-room">
        <div className="setup-header">
          <h2 className="setup-title">Room Lobby</h2>
          <div className="invite-code-box">
            <span className="invite-label">Invite Code:</span>
            <span className="invite-value">{inviteCode}</span>
            <button className="copy-btn" onClick={copyInviteCode}>Copy</button>
          </div>
        </div>

        <div className="setup-section">
          <label className="setup-label">Players ({displayPlayers.length}/3)</label>
          <div className="waiting-players">
              {Array.from({ length: 3 }).map((_, index) => {
                const player = displayPlayers[index];
                return (
                  <div key={index} className={`waiting-player-item ${player ? '' : 'empty'}`}>
                    {player ? (
                      <>
                        <div className="wp-info">
                          <div className="wp-avatar-frame" style={{ borderColor: player.color || '#94a3b8' }}>
                            <img
                              className="wp-avatar"
                              src={player.avatarImg || getPlayerAvatarForUser(player.userId, (player as any).colorKey)}
                              alt={`${player.displayName}'s avatar`}
                              style={{
                                width: `${getPlayerAvatarScale(player.avatarImg || getPlayerAvatarForUser(player.userId, (player as any).colorKey))}%`,
                                height: `${getPlayerAvatarScale(player.avatarImg || getPlayerAvatarForUser(player.userId, (player as any).colorKey))}%`,
                              }}
                            />
                          </div>
                          <span className="wp-name">
                            {index + 1}. {player.displayName} {player.userId === sessionState.userId && '(You)'}
                            {player.isHost && ' 👑'}
                            {player.isAI && <span> · AI</span>}
                          </span>
                        </div>
                        <div className="wp-right">
                          <div className="wp-color-selector">
                             {AVAILABLE_COLORS.map(c => {
                               const isOccupied = displayPlayers.some(p => p.userId !== player.userId && (p as any).colorKey === c.key);
                               const isSelected = (player as any).colorKey === c.key;
                               return (
                                 <button
                                   type="button"
                                   key={c.key}
                                   className={`wp-color-dot ${isSelected ? 'active' : ''} ${isOccupied ? 'disabled' : ''}`}
                                   style={{ backgroundColor: c.color }}
                                   onClick={() => player.userId === sessionState.userId && !isOccupied && void handleSelectColor(c.key)}
                                   disabled={player.userId !== sessionState.userId || isOccupied}
                                   aria-label={`${c.name}${isSelected ? ', selected color' : ''}`}
                                   title={isOccupied ? 'Already in use' : c.name}
                                 />
                               );
                             })}
                          </div>
                          <span className={`wp-status ${player.ready ? 'ready' : ''}`}>
                            {player.ready ? 'Ready' : 'Not Ready'}
                          </span>
                          {player.isAI && sessionState.isHost && renderSeatTypeToggle(true, (nextIsAI) => {
                            if (!nextIsAI) void setOnlineSeatType(false, player);
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="wp-placeholder">
                        <span>Waiting for players...</span>
                        {sessionState.isHost && renderSeatTypeToggle(false, (nextIsAI) => {
                          if (nextIsAI) void setOnlineSeatType(true);
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        <div className="online-actions waiting-actions">
           {sessionState.isHost ? (
             <button className="setup-start-btn" onClick={startGame}>
               Start Game
             </button>
           ) : (
             <button className="setup-start-btn" onClick={toggleReady}>
               {isReady ? 'Cancel Ready' : 'Ready'}
             </button>
           )}
          <button className="setup-start-btn back-btn" onClick={() => { leaveRoom(); setStep('entry'); }}>
             Leave Room
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnlineGameSetup;
