// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
const mock = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown) => void>();
  const socket = {
    connected: true,
    on: vi.fn((name: string, callback: (event: unknown) => void) => { handlers.set(name, callback); }),
    once: vi.fn((name: string, callback: () => void) => { if (name === 'connect') queueMicrotask(callback); }),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
  return {handlers, socket};
});
vi.mock('socket.io-client', () => ({io: () => mock.socket}));
import {signInAsGuest,onRoomEvent,broadcast,leaveRoom,sessionState} from './src/network';
it('waits for authoritative GAME_START then delivers it to browser setup',async()=>{
  expect(await signInAsGuest('Tester')).toBe(true);
  sessionState.roomCode='12345';
  const callback=vi.fn();const off=onRoomEvent(callback);
  const event={type:'GAME_START' as const,payload:{seed:1,hostId:'host',players:[]}};
  await broadcast(event);
  expect(callback).not.toHaveBeenCalled();
  mock.handlers.get('game-event')!(event);
  expect(callback).toHaveBeenCalledWith(event);
  off();await leaveRoom();
});
