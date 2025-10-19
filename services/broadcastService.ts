
import type { WebSocketMessage, LogEntry, Message, LuminousState } from '../types';
import { LogLevel } from '../types';

const wsChannel = new BroadcastChannel('luminous_ws');
let logIdCounter = 0;

export const broadcastUpdate = (message: WebSocketMessage) => {
  wsChannel.postMessage(message);
};

export const broadcastLog = (level: LogLevel, message: string) => {
  const newLog: LogEntry = {
    id: `log-${Date.now()}-${logIdCounter++}`,
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  broadcastUpdate({ type: 'log_add', payload: newLog });
};

export const broadcastMessage = (message: Message) => {
  broadcastUpdate({ type: 'message_add', payload: message });
}

export const broadcastStateUpdate = (state: LuminousState) => {
    broadcastUpdate({ type: 'state_update', payload: state });
}
