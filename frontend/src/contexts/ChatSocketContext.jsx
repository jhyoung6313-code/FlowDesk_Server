import { createContext, useContext } from 'react';

export const ChatSocketContext = createContext({ current: null });

export function useChatSocketContext() {
  return useContext(ChatSocketContext);
}
