import React, { useState } from 'react';
import { Badge, Tooltip } from 'antd';
import useChatStore from '../../store/chatStore';
import { openChatPopup } from '../../utils/chatPopup';

function ChatBubbleIcon({ size = 26, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <path
        d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
        fill={color}
      />
      <circle cx="8"  cy="12" r="1.4" fill="#22c55e" />
      <circle cx="12" cy="12" r="1.4" fill="#22c55e" />
      <circle cx="16" cy="12" r="1.4" fill="#22c55e" />
    </svg>
  );
}

/* 우하단 플로팅 채팅 버튼 (모든 화면 공통) */
export default function ChatFab() {
  const totalUnread = useChatStore((s) => s.totalUnread);
  const [hover, setHover] = useState(false);

  return (
    <Tooltip title="채팅" placement="left">
      <div
        onClick={() => openChatPopup()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: 'fixed',
          right: 28,
          bottom: 28,
          zIndex: 1000,
          cursor: 'pointer',
        }}
      >
        <Badge count={totalUnread} size="small" offset={[-6, 6]}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#22c55e',
              boxShadow: hover
                ? '0 8px 24px rgba(34,197,94,0.45)'
                : '0 4px 16px rgba(34,197,94,0.35)',
              transform: hover ? 'translateY(-2px) scale(1.05)' : 'none',
              transition: 'all 0.18s ease',
            }}
          >
            <ChatBubbleIcon size={26} color="#fff" />
          </div>
        </Badge>
      </div>
    </Tooltip>
  );
}
