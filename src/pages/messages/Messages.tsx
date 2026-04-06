import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Message, Conversation, Inquiry } from '../../types';
import io, { Socket } from 'socket.io-client';
import { Send, AlertCircle, ArrowLeft, MessageSquare, MessageCircleQuestion, Search, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { API_BASE } from '../../config';
import MessageBubble from '../../components/messages/MessageBubble';
import OfferCard from '../../components/booking/OfferCard';
import SendOfferForm from '../../components/booking/SendOfferForm';
import SearchResults from '../../components/messages/SearchResults';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export default function Messages() {
  useDocumentTitle('Messages');
  const { user, token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const recipientParam = searchParams.get('recipient');

  const [socket, setSocket] = useState<Socket | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(
    recipientParam ? parseInt(recipientParam) : null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'thread'>(
    recipientParam ? 'thread' : 'list'
  );
  const [activeInquiry, setActiveInquiry] = useState<Inquiry | null>(null);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<number | null>(null);
  const [highlightText, setHighlightText] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  // Fetch conversations list
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/conversations`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to load conversations');
      const data = await res.json();
      setConversations(data.conversations);
    } catch {
      setError('Failed to load conversations.');
    }
  }, [user, token]);

  // Socket.io connection
  useEffect(() => {
    if (!user) return;

    const newSocket = io('/', {
      transports: ['websocket'],
      auth: { token },
    });

    newSocket.on('receive_message', (message: Message) => {
      // Update thread if viewing this conversation
      setSelectedUserId((currentId) => {
        const isFromSelected = message.sender_id === currentId || message.receiver_id === currentId;
        if (isFromSelected) {
          setMessages((prev) => [...prev, message]);
          scrollToBottom();
        }
        return currentId;
      });

      // Update conversation list
      setConversations((prev) => {
        const otherUserId = message.sender_id === user.id ? message.receiver_id : message.sender_id;
        const existing = prev.find((c) => c.other_user_id === otherUserId);

        if (existing) {
          const updated = prev.map((c) =>
            c.other_user_id === otherUserId
              ? {
                  ...c,
                  last_message: message.content,
                  last_message_at: message.created_at,
                  unread_count: message.sender_id !== user.id ? c.unread_count + 1 : c.unread_count,
                }
              : c
          );
          return updated.sort(
            (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
          );
        }
        // New conversation — refetch to get user details
        fetchConversations();
        return prev;
      });
    });

    setSocket(newSocket);
    return () => { newSocket.disconnect(); };
  }, [user, token, scrollToBottom, fetchConversations]);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Load messages when conversation is selected
  useEffect(() => {
    if (!user || !selectedUserId) return;
    setError(null);

    const fetchMessages = async () => {
      try {
        const res = await fetch(`${API_BASE}/messages/${selectedUserId}`, {
          headers: getAuthHeaders(token),
        });
        if (!res.ok) throw new Error('Failed to load messages');
        const data = await res.json();
        setMessages(data.messages);
        scrollToBottom();

        // Clear unread count for this conversation locally
        setConversations((prev) =>
          prev.map((c) =>
            c.other_user_id === selectedUserId ? { ...c, unread_count: 0 } : c
          )
        );
      } catch {
        setError('Failed to load messages. Please try again.');
      }
    };

    fetchMessages();
  }, [user, selectedUserId, token, scrollToBottom]);

  // Fetch active inquiry for the selected conversation
  useEffect(() => {
    if (!user || !selectedUserId) {
      setActiveInquiry(null);
      return;
    }

    const fetchInquiry = async () => {
      try {
        const params = new URLSearchParams({
          other_user_id: String(selectedUserId),
          status: 'open',
          limit: '1',
        });
        // Check for open inquiries first, then offer_sent
        const resOpen = await fetch(`${API_BASE}/inquiries?${params}`, {
          headers: getAuthHeaders(token),
        });
        if (!resOpen.ok) return;
        const dataOpen = await resOpen.json();
        if (dataOpen.inquiries.length > 0) {
          setActiveInquiry(dataOpen.inquiries[0]);
          return;
        }
        params.set('status', 'offer_sent');
        const resOffer = await fetch(`${API_BASE}/inquiries?${params}`, {
          headers: getAuthHeaders(token),
        });
        if (!resOffer.ok) return;
        const dataOffer = await resOffer.json();
        setActiveInquiry(dataOffer.inquiries[0] ?? null);
      } catch {
        // Silently fail — inquiry context is optional
      }
    };

    fetchInquiry();
  }, [user, selectedUserId, token]);

  // Sync with URL param
  useEffect(() => {
    if (recipientParam) {
      setSelectedUserId(parseInt(recipientParam));
      setMobileView('thread');
    }
  }, [recipientParam]);

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchQuery || searchQuery.length < 2 || !user) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: searchQuery, limit: '20' });
        if (selectedUserId && showSearch) params.set('userId', String(selectedUserId));
        const res = await fetch(`${API_BASE}/messages/search?${params}`, {
          headers: getAuthHeaders(token),
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results);
        }
      } catch {
        // Silently fail
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, user, token, selectedUserId, showSearch]);

  const handleSearchResultClick = (result: any) => {
    selectConversation(result.other_user_id);
    setHighlightMessageId(result.id);
    setHighlightText(searchQuery);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearch(false);
    // Scroll to message after render
    setTimeout(() => {
      document.getElementById(`message-${result.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
    // Clear highlight after 3 seconds
    setTimeout(() => { setHighlightMessageId(null); setHighlightText(''); }, 3000);
  };

  const selectConversation = (userId: number) => {
    setSelectedUserId(userId);
    setMobileView('thread');
    setSearchParams({ recipient: String(userId) });
  };

  const goBackToList = () => {
    setMobileView('list');
    setSelectedUserId(null);
    setMessages([]);
    setSearchParams({});
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !newMessage.trim() || !user || !selectedUserId) return;

    socket.emit('send_message', {
      receiver_id: selectedUserId,
      content: newMessage,
    });
    setNewMessage('');
  };

  const selectedConversation = conversations.find((c) => c.other_user_id === selectedUserId);

  if (!user) return <div className="text-center py-12">Please log in to view messages.</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 h-[calc(100vh-64px)] flex flex-col">
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 flex-grow flex overflow-hidden">
        {/* Conversation List — desktop always visible, mobile conditional */}
        <div className={`w-full md:w-80 md:flex-shrink-0 border-r border-stone-100 flex flex-col ${
          mobileView === 'list' ? 'flex' : 'hidden md:flex'
        }`}>
          <div className="p-4 border-b border-stone-100 bg-stone-50 space-y-2">
            <h2 className="font-bold text-stone-900">Messages</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="w-full pl-9 pr-8 py-2 bg-white border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          {/* Search results overlay */}
          {searchQuery.length >= 2 && (
            <SearchResults
              results={searchResults}
              query={searchQuery}
              loading={searchLoading}
              onSelectResult={handleSearchResultClick}
            />
          )}
          <div className="flex-grow overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 text-stone-300" />
                <p className="text-stone-500 text-sm">No messages yet.</p>
                <p className="text-stone-400 text-xs mt-1">Start a conversation from a sitter's profile.</p>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {conversations.map((conv) => (
                  <button
                    key={conv.other_user_id}
                    onClick={() => selectConversation(conv.other_user_id)}
                    className={`w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-stone-50 ${
                      selectedUserId === conv.other_user_id ? 'bg-emerald-50' : ''
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <img
                        src={conv.other_user_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(conv.other_user_name)}`}
                        alt={conv.other_user_name}
                        className="w-11 h-11 rounded-full object-cover"
                      />
                      {conv.unread_count > 0 && (
                        <span className="absolute -top-1 -right-1 bg-emerald-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                          {conv.unread_count > 9 ? '9+' : conv.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${conv.unread_count > 0 ? 'font-bold text-stone-900' : 'font-medium text-stone-700'}`}>
                          {conv.other_user_name}
                        </span>
                        <span className="text-[10px] text-stone-400 flex-shrink-0 ml-2">
                          {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${conv.unread_count > 0 ? 'text-stone-700 font-medium' : 'text-stone-500'}`}>
                        {conv.last_message}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat Thread — desktop always visible, mobile conditional */}
        <div className={`flex-grow flex flex-col ${
          mobileView === 'thread' ? 'flex' : 'hidden md:flex'
        }`}>
          {error && (
            <div role="alert" className="m-4 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-grow">{error}</span>
              <button onClick={() => setError(null)} aria-label="Dismiss error" className="text-red-400 hover:text-red-600 text-xs font-medium">Dismiss</button>
            </div>
          )}

          {selectedUserId && selectedConversation ? (
            <>
              <div className="p-4 border-b border-stone-100 flex items-center gap-3 bg-stone-50">
                <button
                  onClick={goBackToList}
                  aria-label="Back to conversations"
                  className="md:hidden p-1 text-stone-500 hover:text-stone-700"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <img
                  src={selectedConversation.other_user_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedConversation.other_user_name)}`}
                  alt={selectedConversation.other_user_name}
                  className="w-10 h-10 rounded-full"
                />
                <div className="font-bold text-stone-900 flex-grow">{selectedConversation.other_user_name}</div>
                <button
                  onClick={() => { setShowSearch(!showSearch); setSearchQuery(''); setSearchResults([]); }}
                  className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100 transition-colors"
                  aria-label="Search in conversation"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>

              {/* In-thread search bar */}
              {showSearch && (
                <div className="px-4 py-2 border-b border-stone-100 bg-stone-50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search in this conversation..."
                      className="w-full pl-9 pr-8 py-2 bg-white border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      autoFocus
                    />
                    {searchQuery && (
                      <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {searchQuery.length >= 2 && (
                    <SearchResults results={searchResults} query={searchQuery} loading={searchLoading} onSelectResult={handleSearchResultClick} />
                  )}
                </div>
              )}

              {/* Inquiry context banner */}
              {activeInquiry && (
                <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-emerald-700">
                    <MessageCircleQuestion className="w-4 h-4" />
                    <span className="font-medium">
                      {activeInquiry.status === 'open' && 'Active inquiry'}
                      {activeInquiry.status === 'offer_sent' && 'Offer pending'}
                    </span>
                    {activeInquiry.service_type && (
                      <span className="text-emerald-600">&middot; {activeInquiry.service_type}</span>
                    )}
                  </div>
                  {activeInquiry.status === 'open' && activeInquiry.sitter_id === user.id && (
                    <button
                      onClick={() => setShowOfferForm(true)}
                      className="text-xs font-bold bg-emerald-600 text-white px-3 py-1 rounded-full hover:bg-emerald-700 transition-colors"
                    >
                      Send Offer
                    </button>
                  )}
                </div>
              )}

              <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-stone-50/50">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} isCurrentUser={msg.sender_id === user.id} highlightText={highlightText} highlightId={highlightMessageId ?? undefined} />
                ))}

                {/* Offer card in thread */}
                {activeInquiry && activeInquiry.status === 'offer_sent' && (
                  <OfferCard
                    inquiry={activeInquiry}
                    isOwner={activeInquiry.owner_id === user.id}
                    onUpdate={(updated) => setActiveInquiry(updated)}
                  />
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Send Offer Form Dialog */}
              {activeInquiry && showOfferForm && (
                <SendOfferForm
                  open={showOfferForm}
                  onOpenChange={setShowOfferForm}
                  inquiryId={activeInquiry.id}
                  onSuccess={(updated) => {
                    setActiveInquiry(updated);
                    setShowOfferForm(false);
                  }}
                />
              )}

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
          ) : selectedUserId && !selectedConversation ? (
            // Deep link to a user not in conversations yet — show minimal thread
            <ThreadWithNewUser userId={selectedUserId} user={user} token={token} socket={socket}
              messages={messages} newMessage={newMessage} setNewMessage={setNewMessage}
              handleSendMessage={handleSendMessage} messagesEndRef={messagesEndRef}
              error={error} setError={setError} goBackToList={goBackToList}
            />
          ) : (
            <div className="flex-grow flex items-center justify-center text-stone-400">
              <div className="text-center">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 text-stone-300" />
                <p>Select a conversation to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Thread view for deep-linked users not yet in the conversations list
function ThreadWithNewUser({
  userId, user, token, socket, messages, newMessage, setNewMessage,
  handleSendMessage, messagesEndRef, error, setError, goBackToList,
}: {
  userId: number;
  user: { id: number };
  token: string | null;
  socket: Socket | null;
  messages: Message[];
  newMessage: string;
  setNewMessage: (v: string) => void;
  handleSendMessage: (e: React.FormEvent) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  error: string | null;
  setError: (v: string | null) => void;
  goBackToList: () => void;
}) {
  const [recipientName, setRecipientName] = useState('');
  const [recipientAvatar, setRecipientAvatar] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch(`${API_BASE}/sitters/${userId}`);
        if (!res.ok) throw new Error('User not found');
        const data = await res.json();
        setRecipientName(data.sitter.name);
        setRecipientAvatar(data.sitter.avatar_url || '');
      } catch {
        setError('Failed to load user details.');
      }
    };
    fetchUser();
  }, [userId, setError]);

  return (
    <>
      <div className="p-4 border-b border-stone-100 flex items-center gap-3 bg-stone-50">
        <button onClick={goBackToList} aria-label="Back to conversations" className="md:hidden p-1 text-stone-500 hover:text-stone-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <img
          src={recipientAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(recipientName || 'User')}`}
          alt={recipientName || 'User'}
          className="w-10 h-10 rounded-full"
        />
        <div className="font-bold text-stone-900">{recipientName || 'Loading...'}</div>
      </div>

      {error && (
        <div role="alert" className="m-4 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-grow">{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss error" className="text-red-400 hover:text-red-600 text-xs font-medium">Dismiss</button>
        </div>
      )}

      <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-stone-50/50">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} isCurrentUser={msg.sender_id === user.id} />
        ))}
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
  );
}
