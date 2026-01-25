
import React, { useState, useEffect, useRef } from 'react';
import { Send, User, MessageCircle } from 'lucide-react';

interface Message {
  id: string;
  sender: string;
  message: string;
  timestamp: number;
}

interface FamilyChatProps {
  messages: Message[];
  onSendMessage: (msg: string) => void;
  currentUser: string;
}

export const FamilyChat: React.FC<FamilyChatProps> = ({ messages, onSendMessage, currentUser }) => {
  const [newMessage, setNewMessage] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!newMessage.trim()) return;
    onSendMessage(newMessage);
    setNewMessage('');
  };

  return (
    <div className="flex flex-col h-[400px] bg-white/50 backdrop-blur-sm rounded-xl border border-white/20 overflow-hidden">
      <div className="p-3 border-b border-gray-100 bg-slate-50 flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-purple-600" />
        <span className="font-bold text-slate-700">دائرة العائلة</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-10">
            <p>ابدأ المحادثة مع أفراد العائلة هنا</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender === currentUser;
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div className={`flex items-end gap-2 max-w-[80%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white ${isMe ? 'bg-purple-500' : 'bg-gray-400'}`}>
                  {msg.sender[0]}
                </div>
                <div className={`p-2 rounded-2xl px-3 text-sm ${
                  isMe 
                    ? 'bg-purple-600 text-white rounded-br-none' 
                    : 'bg-white shadow-sm border border-gray-100 text-slate-700 rounded-bl-none'
                }`}>
                  {msg.message}
                </div>
              </div>
              <span className="text-[10px] text-gray-400 mt-1 mx-9">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="p-3 bg-white border-t border-gray-100 flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="اكتب رسالة..."
          className="flex-1 px-4 py-2 bg-gray-50 rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-right"
          dir="auto"
        />
        <button
          onClick={handleSend}
          className="w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
