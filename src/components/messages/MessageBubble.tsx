import React from 'react';
import { Message } from '../../types';
import { format } from 'date-fns';

interface MessageBubbleProps {
  message: Message;
  isCurrentUser: boolean;
}

export default function MessageBubble({ message, isCurrentUser }: MessageBubbleProps) {
  return (
    <div className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[70%] rounded-2xl p-3 ${
        isCurrentUser
          ? 'bg-emerald-600 text-white rounded-br-none'
          : 'bg-white border border-stone-200 text-stone-900 rounded-bl-none'
      }`}>
        <p className="text-sm">{message.content}</p>
        <div className={`text-[10px] mt-1 text-right ${isCurrentUser ? 'text-emerald-200' : 'text-stone-400'}`}>
          {format(new Date(message.created_at), 'h:mm a')}
        </div>
      </div>
    </div>
  );
}
