import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { usePeer } from '../../hooks/usePeer';
import './ChatRoom.css';

export default function ChatRoom() {
  const { chatMessages, myId, myName } = useGameStore();
  const { sendChat } = usePeer();
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = () => {
    if (!text.trim()) return;
    sendChat(text.trim());
    setText('');
  };

  return (
    <div className="chat-wrapper">
      <div className="chat-header">💬 Chat</div>

      <div className="chat-messages">
        {chatMessages.length === 0 && (
          <p className="chat-empty">
            Aucun message...
          </p>
        )}
        {chatMessages.map(msg => {
          const currentName = myName || `Joueur_${myId.slice(0, 5)}`;
          const isMe = msg.senderName === currentName;
          return (
            <div key={msg.id} className="chat-msg-row" style={{ justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <div className={`chat-bubble ${isMe ? 'chat-bubble-me' : 'chat-bubble-other'}`}>
                {!isMe && (
                  <div className="chat-sender-name">{msg.senderName}</div>
                )}
                <div className="chat-msg-text">{msg.text}</div>
                <div className="chat-timestamp">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Écrire un message..."
          className="chat-input"
        />
        <button onClick={handleSend} className="chat-send-btn">➤</button>
      </div>
    </div>
  );
}
