import { analyticsContext, setAnalyticsRoom, trackEvent } from './analytics/client';
import type { OnlineAction } from './engine/gameRuntime';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

export type OnlineGameEvent =
    | { type: 'ROOM_STATE'; payload: any }
    | { type: 'PLAYER_READY'; payload: { userId: string; ready: boolean } }
    | { type: 'COLOR_ASSIGN'; payload: { color: string; userId: string } }
    | { type: 'GAME_START'; payload: { seed: number; hostId: string; players: any[]; gameId?: string; roomId?: string } }
    | { type: 'ACTION'; payload: OnlineAction }
    | { type: 'CHAT'; payload: ChatMessage };

export interface PlayerSlot {
    userId: string;
    displayName: string;
    color: string;
    ready: boolean;
    isHost?: boolean;
    isAI?: boolean;
    id?: number;
    colorKey?: string;
    avatarImg?: string;
    joinedAt?: number;
}

export interface ChatMessage {
    senderId: string;
    senderName: string;
    content: string;
    isSystem: boolean;
    timestamp: number;
}

export const sessionState = {
    userId: '',
    displayName: '',
    roomCode: '',
    isHost: false,
    gameId: '',
    analyticsRoomId: '',
};

let socket: Socket | null = null;

const isProduction = import.meta.env.PROD;
const BASE_URL = import.meta.env.VITE_SERVER_URL || (isProduction ? window.location.origin : 'http://localhost:3001');

const getSocketConfig = () => {
  if (isProduction && BASE_URL === window.location.origin) {

    return {
      path: '/socket.io/'
    };
  }

  return {};
};

const SERVER_URL = BASE_URL;

export function generateRoomCode(): string {
    const chars = '0123456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

export async function signInAsGuest(name: string): Promise<boolean> {
    if (!sessionState.userId) {
        sessionState.userId = `guest-${uuidv4().slice(0, 8)}`;
    }
    sessionState.displayName = name;

    if (socket && socket.connected) {
        console.log('[network] Reusing existing socket connection');
        return true;
    }

    if (socket) {
        console.log('[network] Disconnecting old socket');
        socket.disconnect();
        socket = null;
    }

    console.log('[network] Creating new socket connection to:', SERVER_URL);
    console.log('[network] Environment config:', { isProduction, BASE_URL, windowOrigin: window.location.origin });

    const collector = await analyticsContext();
    const connectionStarted = performance.now();
    try {
      socket = io(SERVER_URL, {
        auth: { analyticsToken: collector?.token },
        ...getSocketConfig(),
        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
    } catch (error) {
      console.error('[network] Failed to create socket:', error);
      return false;
    }

    return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
            trackEvent('connection_result', { success: false, reason: 'connect_timeout' });
            console.error('[network] Connection timeout after 20s');
            console.error('[network] URL used:', SERVER_URL);
            console.error('[network] Socket status:', socket?.connected);
            if (socket) {
                socket.disconnect();
                socket = null;
            }
            resolve(false);
        }, 20000);

        socket!.once('connect', () => {
            clearTimeout(timeout);
            trackEvent('connection_result', { success: true, duration: performance.now() - connectionStarted });
            console.log('[network] Connected to server:', SERVER_URL);

            socket!.on('presence-sync', (members: PlayerSlot[]) => {
                console.log('[network] Presence sync received:', members);
                if (onPresenceCallback) onPresenceCallback(members);
            });

            socket!.on('game-event', (event: OnlineGameEvent) => {
                if (event.type === 'GAME_START') { sessionState.gameId = event.payload.gameId || ''; sessionState.analyticsRoomId = event.payload.roomId || ''; }
                console.log('[network] Game event received:', event);
                if (onEventCallback) onEventCallback(event);
            });

            socket!.on('disconnect', () => {
                trackEvent('connection_result', { success: false, reason: 'disconnected' });
                console.log('[network] Disconnected from server');
            });

            socket!.on('reconnect', () => {
                console.log('[network] Reconnected to server');
            });

            socket!.on('connect_error', (err) => {
                console.error('[network] Connection error:', err);
                console.error('[network] Error message:', err.message);
            });

            resolve(true);
        });

        socket!.once('connect_error', (err) => {
            trackEvent('connection_result', { success: false, reason: 'connect_error' });
            console.error('[network] Immediate connection error:', err);
            console.error('[network] Failed to connect to:', SERVER_URL);
            console.error('[network] Environment:', {
                isProduction,
                BASE_URL,
                currentOrigin: window.location.origin,
                userAgent: navigator.userAgent
            });
            clearTimeout(timeout);
            if (socket) {
                socket.disconnect();
                socket = null;
            }
            resolve(false);
        });
    });
}

export async function joinRoomChannel(roomCode: string): Promise<{ error?: string }> {
    if (!socket) return { error: 'Not connected to the server.' };

    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve({ error: 'Joining the room timed out. Check your connection and try again.' }), 10000);
        socket!.emit('join-room', roomCode, {
            userId: sessionState.userId,
            displayName: sessionState.displayName,
            ready: false,
            isHost: sessionState.isHost,
            color: '',
        }, (response: any) => {
            clearTimeout(timeout);
            if (response && response.error) {
                resolve({ error: response.error });
            } else {
                sessionState.roomCode = roomCode;
                sessionState.analyticsRoomId = response?.roomId || '';
                setAnalyticsRoom(sessionState.analyticsRoomId);
                resolve({});
            }
        });
    });
}

export async function broadcast(event: OnlineGameEvent): Promise<void> {
    if (!socket || !sessionState.roomCode) return;
    socket.emit('broadcast-event', sessionState.roomCode, event);

    if (event.type !== 'GAME_START' && onEventCallback) onEventCallback(event);
}

export async function updatePresence(partial: Partial<PlayerSlot>): Promise<void> {
    if (!socket || !sessionState.roomCode) return;
    socket.emit('update-presence', sessionState.roomCode, sessionState.userId, partial);
}

export async function leaveRoom(): Promise<void> {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    sessionState.roomCode = '';
    sessionState.gameId = '';
    sessionState.analyticsRoomId = '';
    setAnalyticsRoom('');
    sessionState.isHost = false;
    onEventCallback = null;
    onPresenceCallback = null;
}

type EventHandler = (event: OnlineGameEvent) => void;
type PresenceHandler = (members: PlayerSlot[]) => void;

let onEventCallback: EventHandler | null = null;
let onPresenceCallback: PresenceHandler | null = null;

export function onRoomEvent(cb: EventHandler): () => void {
    onEventCallback = cb;
    return () => { if (onEventCallback === cb) onEventCallback = null; };
}
export function onPresenceChange(cb: PresenceHandler): () => void {
    onPresenceCallback = cb;
    return () => { if (onPresenceCallback === cb) onPresenceCallback = null; };
}

export function configureBot(action:'add'|'remove', userId?:string):Promise<{error?:string}> {
  return new Promise(resolve=>{
    if(!socket || !sessionState.isHost){resolve({error:'Only the host can change AI seats.'});return;}
    socket.timeout(5000).emit('configure-bot',sessionState.roomCode,{action,userId},(error:Error|null,result:{error?:string})=>resolve(error?{error:'The AI seat request timed out.'}:result));
  });
}
