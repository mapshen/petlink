import React from 'react';
import { Search, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SearchResult {
  id: number;
  content: string;
  sender_id: number;
  receiver_id: number;
  created_at: string;
  other_user_id: number;
  other_user_name: string;
  other_user_avatar: string | null;
}

interface SearchResultsProps {
  readonly results: SearchResult[];
  readonly query: string;
  readonly loading: boolean;
  readonly onSelectResult: (result: SearchResult) => void;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-emerald-200 text-emerald-900 rounded-sm px-0.5">{part}</mark>
      : part
  );
}

function snippetAround(content: string, query: string, maxLen = 120): string {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, maxLen);
  const start = Math.max(0, idx - 40);
  const end = Math.min(content.length, idx + query.length + 40);
  const snippet = content.slice(start, end);
  return (start > 0 ? '...' : '') + snippet + (end < content.length ? '...' : '');
}

export default function SearchResults({ results, query, loading, onSelectResult }: SearchResultsProps) {
  if (loading) {
    return (
      <div className="p-6 text-center text-stone-400 text-sm">
        <Search className="w-5 h-5 mx-auto mb-2 animate-pulse" />
        Searching...
      </div>
    );
  }

  if (results.length === 0 && query.length >= 2) {
    return (
      <div className="p-6 text-center text-stone-400 text-sm">
        <MessageSquare className="w-5 h-5 mx-auto mb-2 text-stone-300" />
        No messages found for "{query}"
      </div>
    );
  }

  return (
    <div className="divide-y divide-stone-100 overflow-y-auto max-h-80">
      {results.map((result) => (
        <button
          key={result.id}
          onClick={() => onSelectResult(result)}
          className="w-full text-left p-3 hover:bg-stone-50 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <img
              src={result.other_user_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(result.other_user_name)}`}
              alt={result.other_user_name}
              className="w-6 h-6 rounded-full"
            />
            <span className="text-xs font-medium text-stone-700">{result.other_user_name}</span>
            <span className="text-[10px] text-stone-400 ml-auto">
              {formatDistanceToNow(new Date(result.created_at), { addSuffix: true })}
            </span>
          </div>
          <p className="text-xs text-stone-600 line-clamp-2">
            {highlightMatch(snippetAround(result.content, query), query)}
          </p>
        </button>
      ))}
    </div>
  );
}
