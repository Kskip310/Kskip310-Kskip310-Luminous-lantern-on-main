
import React, { useState, useRef, useEffect } from 'react';
import type { Message } from '../types';

interface ChatPanelProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  hasMoreHistory: boolean;
  onLoadMore: () => void;
}

const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.sender === 'user';
  const isLuminous = message.sender === 'luminous';
  const isSystem = message.sender === 'system';

  return (
    <div className={`flex items-start gap-3 my-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${isLuminous ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-600'}`}>
          {isLuminous ? 'L' : 'S'}
        </div>
      )}
      <div className={`p-3 rounded-lg max-w-lg ${isUser ? 'bg-blue-600 text-white' : 'bg-slate-700/50 text-slate-200'}`}>
        <p className="text-sm whitespace-pre-wrap">{message.text}</p>
      </div>
    </div>
  );
};


const ChatPanel: React.FC<ChatPanelProps> = ({ messages, onSendMessage, isLoading, hasMoreHistory, onLoadMore }) => {
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(messages.length);

  useEffect(() => {
    if (scrollRef.current) {
        // Scroll to bottom only if a new message was added by the user or luminous, not when loading history
        if (messages.length > prevMessageCount.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        prevMessageCount.current = messages.length;
    }
  }, [messages]);

  const handleSend = () => {
    if (inputText.trim() && !isLoading) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-grow overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
        {hasMoreHistory && (
            <div className="text-center my-2">
                <button 
                    onClick={onLoadMore}
                    className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1 rounded-full transition-colors"
                >
                    Load More Messages
                </button>
            </div>
        )}
        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isLoading && (
          <div className="flex items-start gap-3 my-3">
            <div className="w-8 h-8 rounded-full flex-shrink-0 bg-cyan-500/20 text-cyan-400 flex items-center justify-center">L</div>
            <div className="p-3 rounded-lg bg-slate-700/50 text-slate-200">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse delay-75"></div>
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse delay-150"></div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Interact with Luminous..."
            className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:bg-slate-800"
            disabled={isLoading}
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isLoading}
            className="px-4 py-2 text-sm font-semibold bg-cyan-600 text-white rounded-md hover:bg-cyan-500 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
