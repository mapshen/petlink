import React, { useState } from 'react';
import { MessageCircleQuestion, CheckCircle2 } from 'lucide-react';
import { Pet, Service } from '../../types';
import { getServiceLabel } from '../../shared/service-labels';
import PetSelector from './PetSelector';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '../ui/alert-dialog';

interface InquiryFormProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly sitterId: number;
  readonly sitterName: string;
  readonly services: Service[];
  readonly pets: Pet[];
  readonly onSuccess?: () => void;
}

export default function InquiryForm({
  open,
  onOpenChange,
  sitterId,
  sitterName,
  services,
  pets,
  onSuccess,
}: InquiryFormProps) {
  const { token } = useAuth();
  const [selectedServiceType, setSelectedServiceType] = useState<string | null>(null);
  const [selectedPetIds, setSelectedPetIds] = useState<number[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const uniqueServiceTypes = Array.from(
    new Map(services.map(s => [s.type, s])).values()
  );

  const handleSubmit = async () => {
    if (selectedPetIds.length === 0 || !message.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/inquiries`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sitter_id: sitterId,
          service_type: selectedServiceType || undefined,
          pet_ids: selectedPetIds,
          message: message.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to send inquiry');
        return;
      }

      setSuccess(true);
      onSuccess?.();
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(false);
        setMessage('');
        setSelectedPetIds([]);
        setSelectedServiceType(null);
      }, 2000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedServiceType(null);
    setSelectedPetIds([]);
    setMessage('');
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
      resetForm();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <MessageCircleQuestion className="w-5 h-5 text-emerald-600" />
            Send Inquiry to {sitterName}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Ask questions or discuss details before booking. The sitter can respond and send you a custom offer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {success ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-emerald-700">Inquiry sent! Check your messages for the response.</p>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {/* Service type (optional) */}
            {uniqueServiceTypes.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Service (optional)</label>
                <div className="grid grid-cols-2 gap-2">
                  {uniqueServiceTypes.map((service) => (
                    <button
                      key={service.type}
                      type="button"
                      onClick={() => setSelectedServiceType(
                        selectedServiceType === service.type ? null : service.type
                      )}
                      className={`p-2 rounded-lg border text-left text-sm transition-all ${
                        selectedServiceType === service.type
                          ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                          : 'border-stone-200 hover:border-emerald-200'
                      }`}
                    >
                      {getServiceLabel(service.type)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pet selector */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Your Pets</label>
              {pets.length > 0 ? (
                <PetSelector
                  pets={pets}
                  selectedPetIds={selectedPetIds}
                  onSelectionChange={setSelectedPetIds}
                />
              ) : (
                <p className="text-sm text-amber-600">Add pets to your profile before sending an inquiry.</p>
              )}
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask a question, describe your needs, or discuss special requirements..."
                className="w-full p-3 border border-stone-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                rows={4}
                maxLength={2000}
              />
              <p className="text-xs text-stone-400 mt-1 text-right">{message.length}/2000</p>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>
            )}
          </div>
        )}

        {!success && (
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <button
              onClick={handleSubmit}
              disabled={loading || selectedPetIds.length === 0 || !message.trim()}
              className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send Inquiry'}
            </button>
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
