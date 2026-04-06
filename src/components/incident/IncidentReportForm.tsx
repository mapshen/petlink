import React, { useState } from 'react';
import type { IncidentCategory } from '../../types';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { useImageUpload } from '../../hooks/useImageUpload';
import { AlertTriangle, X, Plus, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

const CATEGORIES: { slug: IncidentCategory; label: string; emoji: string }[] = [
  { slug: 'pet_injury', label: 'Pet Injury', emoji: '🩹' },
  { slug: 'property_damage', label: 'Property Damage', emoji: '🏠' },
  { slug: 'safety_concern', label: 'Safety Concern', emoji: '⚠️' },
  { slug: 'behavioral_issue', label: 'Behavioral Issue', emoji: '🐾' },
  { slug: 'service_issue', label: 'Service Issue', emoji: '📋' },
  { slug: 'other', label: 'Other', emoji: '💬' },
];

interface Props {
  readonly bookingId: number;
  readonly token: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmitted: () => void;
  readonly bookingLabel?: string;
}

export default function IncidentReportForm({ bookingId, token, open, onOpenChange, onSubmitted, bookingLabel }: Props) {
  const [category, setCategory] = useState<IncidentCategory | null>(null);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [evidence, setEvidence] = useState<{ media_url: string; media_type: 'image' | 'video' }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { upload, uploading } = useImageUpload(token);

  const resetForm = () => {
    setCategory(null);
    setDescription('');
    setNotes('');
    setEvidence([]);
    setError(null);
  };

  const handleEvidenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || evidence.length >= 4) return;

    const mediaType: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
    try {
      const url = await upload(file, 'incidents');
      if (url) {
        setEvidence((prev) => [...prev, { media_url: url, media_type: mediaType }]);
      }
    } catch {
      setError('Failed to upload file');
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const removeEvidence = (index: number) => {
    setEvidence((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!category) {
      setError('Please select an incident type');
      return;
    }
    if (!description.trim()) {
      setError('Please describe what happened');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/incidents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
        body: JSON.stringify({
          booking_id: bookingId,
          category,
          description: description.trim(),
          notes: notes.trim() || null,
          evidence,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit report');
      }

      resetForm();
      onOpenChange(false);
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <DialogTitle className="text-base">Report an Incident</DialogTitle>
              {bookingLabel && (
                <p className="text-xs text-stone-400 mt-0.5">{bookingLabel}</p>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Category selector */}
          <div>
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Incident Type</label>
            <div role="radiogroup" aria-label="Incident Type" className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.slug}
                  type="button"
                  role="radio"
                  aria-checked={category === cat.slug}
                  onClick={() => setCategory(cat.slug)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl text-left transition-colors ${
                    category === cat.slug
                      ? 'border-2 border-red-300 bg-red-50'
                      : 'border border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <span className="text-base">{cat.emoji}</span>
                  <span className={`text-xs font-medium ${category === cat.slug ? 'text-red-800' : 'text-stone-700'}`}>
                    {cat.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
              What happened? <span className="text-red-500">*</span>
            </label>
            <Textarea
              rows={4}
              placeholder="Describe the incident in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
            <div className="text-xs text-stone-400 text-right mt-1">{description.length}/2000</div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
              Additional Notes <span className="text-stone-400 font-normal normal-case">(optional)</span>
            </label>
            <Textarea
              rows={2}
              placeholder="Any other relevant details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
            />
          </div>

          {/* Evidence */}
          <div>
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
              Evidence <span className="text-stone-400 font-normal normal-case">(up to 4 photos/videos)</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {evidence.map((e, i) => (
                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-stone-200 flex-shrink-0">
                  {e.media_type === 'image' ? (
                    <img src={e.media_url} alt="Evidence" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-stone-100 flex items-center justify-center text-lg">🎬</div>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove evidence ${i + 1}`}
                    onClick={() => removeEvidence(i)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-stone-900/60 text-white flex items-center justify-center hover:bg-stone-900/80"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {evidence.length < 4 && (
                <label className="w-20 h-20 rounded-xl border-2 border-dashed border-stone-300 flex flex-col items-center justify-center text-stone-400 hover:border-emerald-500 hover:text-emerald-600 cursor-pointer transition-colors flex-shrink-0">
                  {uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      <span className="text-[10px] mt-0.5">Add</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handleEvidenceUpload}
                    disabled={uploading}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Info banner */}
          <div className="bg-amber-50 rounded-xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              This report will be visible to both parties and reviewed by PetLink. The other party will be notified.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => { resetForm(); onOpenChange(false); }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              onClick={handleSubmit}
              disabled={submitting || uploading}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Submit Report
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
