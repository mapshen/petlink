import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { Message, User } from '../types';
import io, { Socket } from 'socket.io-client';
import { Send, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';

export default function Messages() {
  const { user, token } = useAuth();
  const [searchParams] = useSearchParams();
  const recipientId = searchParams.get('recipient');
  
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [recipient, setRecipient] = useState<User | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;

    // Connect to Socket.io with JWT auth
    const newSocket = io('/', {
      transports: ['websocket'],
      auth: { token },
    });

    newSocket.on('receive_message', (message: Message) => {
      setMessages((prev) => [...prev, message]);
      scrollToBottom();
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !recipientId) return;

    // Fetch recipient details
    const fetchRecipient = async () => {
      try {
        const res = await fetch(`/api/sitters/${recipientId}`); // Reuse sitter endpoint for user details
        const data = await res.json();
        setRecipient(data.sitter);
      } catch {
        // Silently handle — recipient may not be available
      }
    };

    // Fetch message history
    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/messages/${recipientId}`, {
          headers: getAuthHeaders(token)
        });
        const data = await res.json();
        setMessages(data.messages);
        scrollToBottom();
      } catch {
        // Silently handle — messages fetch failed
      }
    };

    fetchRecipient();
    fetchMessages();
  }, [user, recipientId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !newMessage.trim() || !user || !recipientId) return;

    const messageData = {
      receiver_id: parseInt(recipientId),
      content: newMessage
    };

    socket.emit('send_message', messageData);
    setNewMessage('');
  };

  if (!user) return <div className="text-center py-12">Please log in to view messages.</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 h-[calc(100vh-64px)] flex flex-col">
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 flex-grow flex overflow-hidden">
        {/* Sidebar (simplified for MVP) */}
        <div className="w-1/3 border-r border-stone-100 p-4 hidden md:block">
          <h2 className="font-bold text-stone-900 mb-4">Conversations</h2>
          {/* List of conversations would go here */}
          <div className="space-y-2">
            {recipient && (
              <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl cursor-pointer">
                <img 
                  src={recipient.avatar_url || `https://ui-avatars.com/api/?name=${recipient.name}`} 
                  alt={recipient.name} 
                  className="w-10 h-10 rounded-full"
                />
                <div>
                  <div className="font-bold text-stone-900">{recipient.name}</div>
                  <div className="text-xs text-stone-500 truncate">Active now</div>
                </div>
              </div>
            )}
            {!recipient && <p className="text-stone-500 text-sm">Select a conversation or start a new one from a profile.</p>}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-grow flex flex-col">
          {recipient ? (
            <>
              <div className="p-4 border-b border-stone-100 flex items-center gap-3 bg-stone-50">
                <img 
                  src={recipient.avatar_url || `https://ui-avatars.com/api/?name=${recipient.name}`} 
                  alt={recipient.name} 
                  className="w-10 h-10 rounded-full"
                />
                <div className="font-bold text-stone-900">{recipient.name}</div>
              </div>

              <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-stone-50/50">
                {messages.map((msg, idx) => {
                  const isMe = msg.sender_id === user.id;
                  return (
                    <div key={idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-2xl p-3 ${
                        isMe 
                          ? 'bg-emerald-600 text-white rounded-br-none' 
                          : 'bg-white border border-stone-200 text-stone-900 rounded-bl-none'
                      }`}>
                        <p className="text-sm">{msg.content}</p>
                        <div className={`text-[10px] mt-1 text-right ${isMe ? 'text-emerald-200' : 'text-stone-400'}`}>
                          {format(new Date(msg.created_at), 'h:mm a')}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="p-4 border-t border-stone-100 bg-white">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-grow p-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                  <button 
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="bg-emerald-600 text-white p-3 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-grow flex items-center justify-center text-stone-400">
              Select a conversation to start chatting
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
