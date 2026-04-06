/**
 * Dispute status and resolution labels — shared between server and client.
 */

export const DISPUTE_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  open: { label: 'Open', bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  under_review: { label: 'Under Review', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  awaiting_response: { label: 'Awaiting Response', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  resolved: { label: 'Resolved', bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  closed: { label: 'Closed', bg: 'bg-stone-100', text: 'text-stone-600', dot: 'bg-stone-400' },
};

export const RESOLUTION_TYPE_LABELS: Record<string, string> = {
  full_refund: 'Full Refund',
  partial_refund: 'Partial Refund',
  credit: 'Account Credit',
  warning_owner: 'Warning to Owner',
  warning_sitter: 'Warning to Sitter',
  ban_owner: 'Ban Owner',
  ban_sitter: 'Ban Sitter',
  no_action: 'No Action',
};

export function getDisputeStatusConfig(status: string) {
  return DISPUTE_STATUS_CONFIG[status] ?? DISPUTE_STATUS_CONFIG.open;
}

export function getResolutionLabel(type: string): string {
  return RESOLUTION_TYPE_LABELS[type] ?? type;
}
