import { Badge } from '../ui/badge';
import { ExternalLink } from 'lucide-react';

interface ImportedReviewBadgeProps {
  platform: string;
}

const platformNames: Record<string, string> = {
  rover: 'Rover',
  wag: 'Wag',
  care_com: 'Care.com',
};

export default function ImportedReviewBadge({ platform }: ImportedReviewBadgeProps) {
  const name = platformNames[platform] ?? platform;
  return (
    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs gap-1">
      <ExternalLink className="w-3 h-3" />
      Imported from {name}
    </Badge>
  );
}
