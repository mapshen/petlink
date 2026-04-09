import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Image, ArrowLeft } from 'lucide-react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import type { LiveThread as LiveThreadType, LiveThreadMessage } from '../../types';
import io from 'socket.io-client';

interface LiveThreadProps {
  threadId: number;
  onBack: () => void;
}

export default function LiveThread({ threadId, onBack }: LiveThreadProps) {
  const { user, token } = useAuth();
  const [messages, setMessages] = useState<LiveThreadMessage[]>([]);
  const [input, setInput] = useState('');
  const [thread, setThread] = useState<LiveThreadType | null>(null);
  const [participants, setParticipants] = useState<Array<{ user_id: number; user_name: string }>>([]);
  const [archived, setArchived] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Fetch initial messages
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/live-threads/${threadId}/messages?limit=100`, { headers: getAuthHeaders(token) })
      .then(r => r.ok ? r.json() : { messages: [] })
      .then(data => {
        setMessages(data.messages || []);
        setTimeout(scrollToBottom, 100);
      })
      .catch(() => {});
  }, [threadId, token, scrollToBottom]);

  // Socket connection
  useEffect(() => {
    if (!token) return;

    const socket = io({ auth: { token } });
    socketRef.current = socket;

    socket.emit('join_live_thread', { thread_id: threadId });

    socket.on('live_message', (msg: LiveThreadMessage) => {
      setMessages(prev => [...prev, msg]);
      setTimeout(scrollToBottom, 50);
    });

    socket.on('participant_joined', (data: { user_id: number; user_name: string }) => {
      setParticipants(prev => {
        if (prev.some(p => p.user_id === data.user_id)) return prev;
        return [...prev, data];
      });
    });

    socket.on('participant_left', (data: { user_id: number }) => {
      setParticipants(prev => prev.filter(p => p.user_id !== data.user_id));
    });

    socket.on('live_thread_archived', () => {
      setArchived(true);
    });

    return () => {
      socket.emit('leave_live_thread', { thread_id: threadId });
      socket.disconnect();
    };
  }, [threadId, token, scrollToBottom]);

  function sendMessage() {
    if (!input.trim() || !socketRef.current || archived) return;
    socketRef.current.emit('live_message', {
      thread_id: threadId,
      content: input.trim(),
    });
    setInput('');
  }

  function handleTyping() {
    socketRef.current?.emit('live_typing', { thread_id: threadId });
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden flex flex-col max-h-[600px]">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 p-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-emerald-100 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {!archived && <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />}
              <h2 className="text-white font-semibold text-sm">{thread?.title || 'Live Thread'}</h2>
            </div>
            <div className="text-emerald-100 text-xs mt-0.5">
              {archived ? 'Archived' : `${participants.length} people`}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className="flex gap-2.5">
            <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-[10px] font-medium flex-shrink-0 overflow-hidden">
              {msg.author_avatar_url ? (
                <img src={msg.author_avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                (msg.author_name || '?')[0].toUpperCase()
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-stone-700">{msg.author_name}</span>
                <span className="text-[10px] text-stone-400">
                  {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              <div className="bg-stone-50 rounded-2xl rounded-tl-sm px-3 py-2 mt-0.5 text-sm text-stone-700 max-w-md">
                {msg.content}
              </div>
              {msg.photo_url && (
                <img src={msg.photo_url} alt="" className="mt-1 rounded-xl max-h-48 max-w-xs" />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {!archived ? (
        <div className="p-3 border-t border-stone-100 flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={e => { setInput(e.target.value); handleTyping(); }}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Message..."
            className="flex-1 text-sm border border-stone-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            maxLength={2000}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="p-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="p-3 border-t border-stone-100 text-center text-xs text-stone-400">
          This thread has been archived
        </div>
      )}
    </div>
  );
}
