import { useState } from 'react';
import { Info } from 'lucide-react';

export default function FirstBookingNudge() {
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem('petlink_first_booking_dismissed') === 'true'
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem('petlink_first_booking_dismissed', 'true');
    setDismissed(true);
  };

  return (
    <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 space-y-2 mb-6">
      <div className="flex items-center gap-2">
        <Info className="w-5 h-5 text-sky-500" />
        <span className="text-sm font-bold text-sky-800">Your first booking — here's how it works</span>
      </div>
      <ol className="text-xs text-sky-700 space-y-1.5 pl-7 list-decimal">
        <li><strong>Submit your request</strong> — the sitter will be notified immediately</li>
        <li><strong>Sitter reviews & confirms</strong> — usually within a few hours</li>
        <li><strong>Payment is held</strong> — you're not charged until the service is complete</li>
        <li><strong>Day of service</strong> — you'll receive updates and can track in real time</li>
        <li><strong>After completion</strong> — leave a review and tip if you'd like!</li>
      </ol>
      <button
        type="button"
        onClick={handleDismiss}
        className="text-xs text-sky-500 hover:text-sky-700 font-medium"
      >
        Got it, don't show again
      </button>
    </div>
  );
}
