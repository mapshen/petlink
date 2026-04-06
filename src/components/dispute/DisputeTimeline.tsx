import React from 'react';
import type { DisputeMessage } from '../../types';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  readonly messages: DisputeMessage[];
  readonly currentUserId?: number;
}

const ROLE_STYLES: Record<string, { bg: string; label: string }> = {
  owner: { bg: 'bg-blue-50', label: 'Owner' },
  sitter: { bg: 'bg-stone-100', label: 'Sitter' },
  admin: { bg: 'bg-purple-50', label: 'Mediator' },
};

export default function DisputeTimeline({ messages, currentUserId }: Props) {
  if (messages.length === 0) {
    return <p className="text-sm text-stone-400 text-center py-4">No messages yet.</p>;
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => {
        const role = msg.sender_role ?? 'owner';
        const style = ROLE_STYLES[role] ?? ROLE_STYLES.owner;
        const isSelf = msg.sender_id === currentUserId;

        return (
          <div key={msg.id} className="flex gap-3">
            <Avatar className="w-7 h-7 flex-shrink-0 mt-0.5">
              {role === 'admin' ? (
                <AvatarFallback className="bg-purple-100">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                </AvatarFallback>
              ) : (
                <>
                  <AvatarImage src={msg.sender_avatar ?? undefined} alt={msg.sender_name} />
                  <AvatarFallback className="text-xs">{msg.sender_name?.charAt(0) ?? '?'}</AvatarFallback>
                </>
              )}
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${role === 'admin' ? 'text-purple-700' : 'text-stone-800'}`}>
                  {isSelf ? 'You' : msg.sender_name}
                </span>
                <span className="text-[10px] text-stone-400">
                  {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                </span>
                {msg.is_admin_note && (
                  <span className="text-[10px] font-medium text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">Internal</span>
                )}
              </div>
              <div className={`mt-1 rounded-xl rounded-tl-none px-3 py-2 text-sm text-stone-700 ${style.bg}`}>
                {msg.content}
              </div>
              {msg.evidence_urls && msg.evidence_urls.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {msg.evidence_urls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-14 h-14 rounded-lg border border-stone-200 overflow-hidden hover:opacity-80 transition-opacity flex-shrink-0"
                    >
                      <img src={url} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
