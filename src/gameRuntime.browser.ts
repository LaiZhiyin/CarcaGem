import { audioManager } from './audio';
import { broadcast, onRoomEvent, sessionState } from './network';
import type { GameRuntime } from './engine/gameRuntime';

export const browserGameRuntime: GameRuntime = {
  localUserId: () => sessionState.userId,
  onAction: (handler) => { onRoomEvent((event) => { if (event.type === 'ACTION') handler(event.payload); }); },
  sendAction: (payload) => { void broadcast({ type: 'ACTION', payload }); },
  playSound: (sound) => { audioManager[sound](); },
};
