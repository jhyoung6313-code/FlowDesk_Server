import { useEffect } from 'react';
import ChatPage from '../Chat';

export default function ChatPopupPage() {
  useEffect(() => {
    document.title = 'FlowDesk 채팅';
  }, []);

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <ChatPage />
    </div>
  );
}
