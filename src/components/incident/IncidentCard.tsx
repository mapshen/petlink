import React from 'react';
import type { IncidentReport } from '../../types';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import { format } from 'date-fns';

const CATEGORY_CONFIG: Record<string, { label: string; emoji: string; bg: string; text: string }> = {
  pet_injury: { label: 'Pet Injury', emoji: '🩹', bg: 'bg-red-100', text: 'text-red-800' },
  property_damage: { label: 'Property Damage', emoji: '🏠', bg: 'bg-orange-100', text: 'text-orange-800' },
  safety_concern: { label: 'Safety Concern', emoji: '⚠️', bg: 'bg-red-100', text: 'text-red-800' },
  behavioral_issue: { label: 'Behavioral Issue', emoji: '🐾', bg: 'bg-amber-100', text: 'text-amber-800' },
  service_issue: { label: 'Service Issue', emoji: '📋', bg: 'bg-blue-100', text: 'text-blue-800' },
  other: { label: 'Other', emoji: '💬', bg: 'bg-stone-100', text: 'text-stone-700' },
};

export function getCategoryConfig(category: string) {
  return CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.other;
}

interface Props {
  readonly incident: IncidentReport;
  readonly currentUserId?: number;
}

export default function IncidentCard({ incident, currentUserId }: Props) {
  const cat = getCategoryConfig(incident.category);
  const isReporter = incident.reporter_id === currentUserId;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarImage src={incident.reporter_avatar ?? undefined} alt={incident.reporter_name} />
            <AvatarFallback className="text-xs">{incident.reporter_name?.charAt(0) ?? '?'}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-stone-900">
                {isReporter ? 'You' : incident.reporter_name}
              </span>
            </div>
            <div className="text-xs text-stone-400 mt-0.5">
              {format(new Date(incident.created_at), 'MMM d, yyyy · h:mm a')}
            </div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cat.bg} ${cat.text}`}>
          {cat.emoji} {cat.label}
        </span>
      </div>

      <p className="text-sm text-stone-700 mt-3 leading-relaxed whitespace-pre-line">
        {incident.description}
      </p>

      {incident.notes && (
        <p className="text-xs text-stone-500 mt-2 italic">
          Note: {incident.notes}
        </p>
      )}

      {incident.evidence && incident.evidence.length > 0 && (
        <div className="flex gap-2 mt-3">
          {incident.evidence.map((e) => (
            <a
              key={e.id}
              href={e.media_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-16 h-16 rounded-lg border border-stone-200 overflow-hidden flex-shrink-0 hover:opacity-80 transition-opacity"
            >
              {e.media_type === 'image' ? (
                <img src={e.media_url} alt="Evidence" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-stone-100 flex items-center justify-center text-xs text-stone-500">
                  🎬
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
