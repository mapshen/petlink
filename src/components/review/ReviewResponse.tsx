import { format } from 'date-fns';

interface ReviewResponseProps {
  responseText: string;
  responseAt: string;
  respondentName: string;
}

export default function ReviewResponse({ responseText, responseAt, respondentName }: ReviewResponseProps) {
  return (
    <div className="mt-2 ml-3 pl-3 border-l-2 border-emerald-200 bg-emerald-50/50 rounded-r-lg py-1.5 pr-3">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[10px] font-semibold text-emerald-700">{respondentName}'s Response</span>
        <span className="text-[10px] text-stone-400">{format(new Date(responseAt), 'MMM d')}</span>
      </div>
      <p className="text-xs text-stone-600">{responseText}</p>
    </div>
  );
}
