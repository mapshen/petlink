import React from 'react';
import { Message } from '../../types';
import { format } from 'date-fns';

interface MessageBubbleProps {
  message: Message;
  isCurrentUser: boolean;
  highlightText?: string;
  highlightId?: number;
}

function renderContent(content: string, highlightText?: string): React.ReactNode {
  if (!highlightText || highlightText.length < 2) return content;
  const regex = new RegExp(`(${highlightText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = content.split(regex);
  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">{part}</mark>
      : part
  );
}

export default function MessageBubble({ message, isCurrentUser, highlightText, highlightId }: MessageBubbleProps) {
  const isHighlighted = highlightId === message.id;

  return (
    <div
      id={`message-${message.id}`}
      className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} ${isHighlighted ? 'animate-pulse' : ''}`}
    >
      <div className={`max-w-[70%] rounded-2xl p-3 ${
        isCurrentUser
          ? 'bg-emerald-600 text-white rounded-br-none'
          : 'bg-white border border-stone-200 text-stone-900 rounded-bl-none'
      } ${isHighlighted ? 'ring-2 ring-emerald-400' : ''}`}>
        <p className="text-sm">{renderContent(message.content, highlightText)}</p>
        <div className={`text-[10px] mt-1 text-right ${isCurrentUser ? 'text-emerald-200' : 'text-stone-400'}`}>
          {format(new Date(message.created_at), 'h:mm a')}
        </div>
      </div>
    </div>
  );
}
