import { Resend } from 'resend';
import logger from './logger.ts';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.EMAIL_FROM || 'PetLink <noreply@petlink.app>';

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeSubject(str: string): string {
  return str.replace(/[\r\n]/g, ' ').trim();
}

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(payload: EmailPayload): Promise<{ id: string } | null> {
  if (!resend) return null;

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  });

  if (error) {
    logger.warn({ err: error }, 'Email send failed');
    return null;
  }

  return data;
}

function emailWrapper(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
<div style="text-align:center;margin-bottom:24px">
<span style="font-size:24px;font-weight:700;color:#059669">🐾 PetLink</span>
</div>
<h2 style="margin:0 0 16px;font-size:18px;color:#1c1917">${title}</h2>
${content}
</div>
<p style="text-align:center;color:#a8a29e;font-size:12px;margin-top:16px">
You received this because you have email notifications enabled on PetLink.
</p>
</div>
</body>
</html>`;
}

export function buildBookingConfirmationEmail(params: {
  ownerName: string;
  sitterName: string;
  serviceName: string;
  startTime: string;
  totalPriceCents: number;
}): { subject: string; html: string } {
  const owner = escapeHtml(params.ownerName);
  const sitter = escapeHtml(params.sitterName);
  const service = escapeHtml(params.serviceName);
  const time = escapeHtml(params.startTime);
  return {
    subject: sanitizeSubject(`Booking Request Submitted — ${params.serviceName} with ${params.sitterName}`),
    html: emailWrapper('Booking Request Submitted', `
<p style="color:#44403c;line-height:1.6">Hi ${owner},</p>
<p style="color:#44403c;line-height:1.6">Your booking request has been submitted!</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">
<tr><td style="padding:8px 0;color:#78716c;font-size:14px">Sitter</td><td style="padding:8px 0;color:#1c1917;font-size:14px;text-align:right">${sitter}</td></tr>
<tr><td style="padding:8px 0;color:#78716c;font-size:14px">Service</td><td style="padding:8px 0;color:#1c1917;font-size:14px;text-align:right">${service}</td></tr>
<tr><td style="padding:8px 0;color:#78716c;font-size:14px">Date</td><td style="padding:8px 0;color:#1c1917;font-size:14px;text-align:right">${time}</td></tr>
<tr style="border-top:1px solid #e7e5e4"><td style="padding:8px 0;color:#78716c;font-size:14px;font-weight:600">Total</td><td style="padding:8px 0;color:#059669;font-size:14px;font-weight:600;text-align:right">${params.totalPriceCents === 0 ? 'Free' : `$${(params.totalPriceCents / 100).toFixed(2)}`}</td></tr>
</table>
<p style="color:#78716c;font-size:14px">The sitter will review your request shortly.</p>
`),
  };
}

export function buildBookingStatusEmail(params: {
  recipientName: string;
  otherPartyName: string;
  status: 'confirmed' | 'cancelled';
  serviceName: string;
  startTime: string;
}): { subject: string; html: string } {
  const recipient = escapeHtml(params.recipientName);
  const other = escapeHtml(params.otherPartyName);
  const service = escapeHtml(params.serviceName);
  const time = escapeHtml(params.startTime);
  const statusColor = params.status === 'confirmed' ? '#059669' : '#dc2626';
  const statusLabel = params.status === 'confirmed' ? 'Confirmed' : 'Cancelled';
  const statusMsg = params.status === 'confirmed'
    ? `Great news! Your booking for ${service} has been confirmed.`
    : `Your booking for ${service} has been cancelled.`;

  return {
    subject: sanitizeSubject(`Booking ${statusLabel} — ${params.serviceName}`),
    html: emailWrapper(`Booking ${statusLabel}`, `
<p style="color:#44403c;line-height:1.6">Hi ${recipient},</p>
<p style="color:#44403c;line-height:1.6">${statusMsg}</p>
<div style="background:#fafaf9;border-radius:8px;padding:16px;margin:16px 0">
<p style="margin:0 0 4px;color:#78716c;font-size:13px">Status</p>
<p style="margin:0;font-weight:600;color:${statusColor}">${statusLabel}</p>
</div>
<table style="width:100%;border-collapse:collapse;margin:16px 0">
<tr><td style="padding:8px 0;color:#78716c;font-size:14px">With</td><td style="padding:8px 0;color:#1c1917;font-size:14px;text-align:right">${other}</td></tr>
<tr><td style="padding:8px 0;color:#78716c;font-size:14px">Date</td><td style="padding:8px 0;color:#1c1917;font-size:14px;text-align:right">${time}</td></tr>
</table>
`),
  };
}

export function buildNewMessageEmail(params: {
  recipientName: string;
  senderName: string;
  messagePreview: string;
}): { subject: string; html: string } {
  const recipient = escapeHtml(params.recipientName);
  const sender = escapeHtml(params.senderName);
  const preview = escapeHtml(params.messagePreview);
  return {
    subject: sanitizeSubject(`New message from ${params.senderName}`),
    html: emailWrapper('New Message', `
<p style="color:#44403c;line-height:1.6">Hi ${recipient},</p>
<p style="color:#44403c;line-height:1.6">You have a new message from <strong>${sender}</strong>:</p>
<div style="background:#fafaf9;border-radius:8px;padding:16px;margin:16px 0;border-left:3px solid #059669">
<p style="margin:0;color:#44403c;font-style:italic">"${preview}"</p>
</div>
<p style="color:#78716c;font-size:14px">Log in to PetLink to reply.</p>
`),
  };
}

export function buildApprovalStatusEmail(params: {
  sitterName: string;
  status: 'approved' | 'rejected' | 'banned';
  reason?: string;
}): { subject: string; html: string } {
  const name = escapeHtml(params.sitterName);
  const isApproved = params.status === 'approved';
  const statusLabel = isApproved ? 'Approved' : 'Not Approved';
  const statusColor = isApproved ? '#059669' : '#dc2626';
  const message = isApproved
    ? 'Your sitter account has been approved! You can now create services and start accepting bookings.'
    : 'Unfortunately, your sitter application was not approved at this time.';

  const reasonBlock = !isApproved && params.reason
    ? `<div style="background:#fafaf9;border-radius:8px;padding:16px;margin:16px 0;border-left:3px solid #dc2626">
<p style="margin:0 0 4px;color:#78716c;font-size:13px">Reason</p>
<p style="margin:0;color:#44403c">${escapeHtml(params.reason)}</p>
</div>`
    : '';

  return {
    subject: sanitizeSubject(`Sitter Application ${statusLabel}`),
    html: emailWrapper(`Application ${statusLabel}`, `
<p style="color:#44403c;line-height:1.6">Hi ${name},</p>
<p style="color:#44403c;line-height:1.6">${message}</p>
<div style="background:#fafaf9;border-radius:8px;padding:16px;margin:16px 0">
<p style="margin:0 0 4px;color:#78716c;font-size:13px">Status</p>
<p style="margin:0;font-weight:600;color:${statusColor}">${statusLabel}</p>
</div>
${reasonBlock}
${isApproved ? '<p style="color:#78716c;font-size:14px">Log in to PetLink to set up your services and availability.</p>' : '<p style="color:#78716c;font-size:14px">If you have questions, please contact support.</p>'}
`),
  };
}

export function buildOwnerWelcomeEmail(params: {
  ownerName: string;
}): { subject: string; html: string } {
  const name = escapeHtml(params.ownerName);
  return {
    subject: sanitizeSubject('Welcome to PetLink!'),
    html: emailWrapper('Welcome to PetLink! 🎉', `
<p style="color:#44403c;line-height:1.6">Hi ${name},</p>
<p style="color:#44403c;line-height:1.6">Thanks for joining PetLink — the easiest way to find trusted pet sitters near you.</p>
<p style="color:#44403c;line-height:1.6;font-weight:600">Here's what you can do:</p>
<ul style="color:#44403c;line-height:1.8;padding-left:20px">
<li>🔍 Search for nearby sitters by service, location, and price</li>
<li>📅 Book services like pet walking, house sitting, and drop-in visits</li>
<li>📍 Track your pet's care sessions in real time</li>
</ul>
<div style="text-align:center;margin:24px 0">
<a href="https://petlink.app/search" style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Find a Sitter</a>
</div>
<p style="color:#78716c;font-size:14px">If you have any questions, we're here to help!</p>
`),
  };
}

export function buildSitterWelcomeEmail(params: {
  sitterName: string;
}): { subject: string; html: string } {
  const name = escapeHtml(params.sitterName);
  return {
    subject: sanitizeSubject('Welcome to PetLink — Next Steps'),
    html: emailWrapper('Welcome to PetLink! 🎉', `
<p style="color:#44403c;line-height:1.6">Hi ${name},</p>
<p style="color:#44403c;line-height:1.6">Thanks for signing up as a sitter on PetLink!</p>
<div style="background:#fefce8;border-radius:8px;padding:16px;margin:16px 0;border-left:3px solid #f59e0b">
<p style="margin:0;color:#92400e;font-size:14px"><strong>Your account is pending approval.</strong> Our team will review your profile shortly.</p>
</div>
<p style="color:#44403c;line-height:1.6;font-weight:600">While you wait, get a head start:</p>
<ol style="color:#44403c;line-height:1.8;padding-left:20px">
<li>Complete your profile with a photo and bio</li>
<li>Import your reviews from Rover or other platforms</li>
<li>Set your availability and service areas</li>
</ol>
<div style="text-align:center;margin:24px 0">
<a href="https://petlink.app/profile" style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Complete Your Profile</a>
</div>
<p style="color:#78716c;font-size:14px">We'll notify you once your account is approved.</p>
`),
  };
}

export function buildSitterNewBookingEmail(params: {
  sitterName: string;
  ownerName: string;
  serviceName: string;
  startTime: string;
  totalPriceCents: number;
}): { subject: string; html: string } {
  const sitter = escapeHtml(params.sitterName);
  const owner = escapeHtml(params.ownerName);
  const service = escapeHtml(params.serviceName);
  const time = escapeHtml(params.startTime);
  return {
    subject: sanitizeSubject(`New Booking Request from ${params.ownerName}`),
    html: emailWrapper('New Booking Request', `
<p style="color:#44403c;line-height:1.6">Hi ${sitter},</p>
<p style="color:#44403c;line-height:1.6">You have a new booking request!</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">
<tr><td style="padding:8px 0;color:#78716c;font-size:14px">From</td><td style="padding:8px 0;color:#1c1917;font-size:14px;text-align:right">${owner}</td></tr>
<tr><td style="padding:8px 0;color:#78716c;font-size:14px">Service</td><td style="padding:8px 0;color:#1c1917;font-size:14px;text-align:right">${service}</td></tr>
<tr><td style="padding:8px 0;color:#78716c;font-size:14px">Date</td><td style="padding:8px 0;color:#1c1917;font-size:14px;text-align:right">${time}</td></tr>
<tr style="border-top:1px solid #e7e5e4"><td style="padding:8px 0;color:#78716c;font-size:14px;font-weight:600">Price</td><td style="padding:8px 0;color:#059669;font-size:14px;font-weight:600;text-align:right">${params.totalPriceCents === 0 ? 'Free' : `$${(params.totalPriceCents / 100).toFixed(2)}`}</td></tr>
</table>
<p style="color:#78716c;font-size:14px">Log in to PetLink to accept or decline.</p>
`),
  };
}

export function buildOnboardingReminderEmail(params: {
  sitterName: string;
  steps: { profile: boolean; services: boolean; photos: boolean; verification: boolean };
  reminderNumber: number;
}): { subject: string; html: string } {
  const name = escapeHtml(params.sitterName);
  const check = '&#x2705;';
  const cross = '&#x274C;';

  const stepRows = [
    { label: 'Profile (name &amp; bio)', done: params.steps.profile, required: true },
    { label: 'Services &amp; pricing', done: params.steps.services, required: true },
    { label: 'Profile photo', done: params.steps.photos, required: false },
    { label: 'Verification', done: params.steps.verification, required: false },
  ].map(s =>
    `<tr><td style="padding:6px 0;color:${s.done ? '#059669' : '#dc2626'};font-size:14px">${s.done ? check : cross}</td><td style="padding:6px 0;color:#1c1917;font-size:14px">${s.label}${s.required ? ' <span style="color:#dc2626;font-size:11px">(required)</span>' : ''}</td></tr>`
  ).join('');

  const tip = params.reminderNumber === 1
    ? 'Sitters with completed profiles get <strong>3x more booking requests</strong>.'
    : params.reminderNumber === 2
    ? 'Adding a photo and bio helps owners feel confident choosing you.'
    : 'You\'re almost there! Just a few more steps to start earning.';

  return {
    subject: sanitizeSubject(`Finish setting up your PetLink sitter profile`),
    html: emailWrapper('Complete Your Sitter Profile', `
<p style="color:#44403c;line-height:1.6">Hi ${name},</p>
<p style="color:#44403c;line-height:1.6">${tip}</p>
<p style="color:#44403c;line-height:1.6;font-weight:600">Your progress:</p>
<table style="width:100%;border-collapse:collapse;margin:8px 0 16px">${stepRows}</table>
<div style="text-align:center;margin:24px 0">
<a href="${process.env.APP_URL || 'https://petlink.app'}/onboarding" style="display:inline-block;background:#059669;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">Continue Setup</a>
</div>
<p style="color:#a8a29e;font-size:12px">Takes about 5 minutes to complete. You can also reply to this email with questions.</p>
`),
  };
}

export function buildReferenceInviteEmail(params: {
  clientName: string;
  sitterName: string;
  vouchUrl: string;
}): { subject: string; html: string } {
  const client = escapeHtml(params.clientName);
  const sitter = escapeHtml(params.sitterName);
  return {
    subject: sanitizeSubject(`${params.sitterName} is asking for your reference on PetLink`),
    html: emailWrapper('Reference Request', `
<p style="color:#44403c;line-height:1.6">Hi ${client},</p>
<p style="color:#44403c;line-height:1.6"><strong>${sitter}</strong> listed you as a past pet care client and is asking for a brief reference on PetLink, a pet services platform.</p>
<p style="color:#44403c;line-height:1.6">If you've used their services before, a quick rating and comment would help them get started on the platform.</p>
<div style="text-align:center;margin:24px 0">
<a href="${escapeHtml(params.vouchUrl)}" style="display:inline-block;background:#059669;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">Write a Reference</a>
</div>
<p style="color:#a8a29e;font-size:12px">This takes less than a minute. If you don't know this person, you can safely ignore this email.</p>
`),
  };
}

import { getIncidentCategoryLabel } from '../shared/incident-categories.ts';

const DISPUTE_STATUS_LABELS: Record<string, string> = {
  open: 'Opened',
  under_review: 'Under Review',
  awaiting_response: 'Awaiting Your Response',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function buildDisputeStatusEmail(params: {
  recipientName: string;
  status: string;
  bookingId: number;
  reason?: string;
}): { subject: string; html: string } {
  const recipient = escapeHtml(params.recipientName);
  const statusLabel = DISPUTE_STATUS_LABELS[params.status] || params.status;
  const statusColor = params.status === 'resolved' ? '#059669' : params.status === 'closed' ? '#78716c' : '#7e22ce';

  return {
    subject: sanitizeSubject(`Dispute ${statusLabel} — Booking #${params.bookingId}`),
    html: emailWrapper(`Dispute ${statusLabel}`, `
<p style="color:#44403c;line-height:1.6">Hi ${recipient},</p>
<p style="color:#44403c;line-height:1.6">A dispute on your booking has been updated.</p>
<div style="background:#faf5ff;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid ${statusColor}">
<p style="margin:0 0 4px;color:#78716c;font-size:13px">Status</p>
<p style="margin:0;font-weight:600;color:${statusColor}">${escapeHtml(statusLabel)}</p>
</div>
${params.reason ? `<div style="background:#fafaf9;border-radius:8px;padding:16px;margin:16px 0"><p style="margin:0 0 4px;color:#78716c;font-size:13px">Reason</p><p style="margin:0;color:#1c1917;font-size:14px">${escapeHtml(params.reason.slice(0, 300))}${params.reason.length > 300 ? '...' : ''}</p></div>` : ''}
<div style="text-align:center;margin:24px 0">
<a href="${process.env.APP_URL || 'https://petlink.app'}/home" style="display:inline-block;background:#7e22ce;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">View Dispute</a>
</div>
`),
  };
}

export function buildDisputeResolutionEmail(params: {
  recipientName: string;
  resolutionType: string;
  resolutionNotes: string;
  refundAmount?: string;
  bookingId: number;
}): { subject: string; html: string } {
  const recipient = escapeHtml(params.recipientName);
  const typeLabels: Record<string, string> = {
    full_refund: 'Full Refund',
    partial_refund: 'Partial Refund',
    credit: 'Account Credit',
    warning_owner: 'Warning Issued',
    warning_sitter: 'Warning Issued',
    ban_owner: 'Account Action',
    ban_sitter: 'Account Action',
    no_action: 'No Action Taken',
  };
  const label = typeLabels[params.resolutionType] || params.resolutionType;

  return {
    subject: sanitizeSubject(`Dispute Resolved — ${label}`),
    html: emailWrapper('Dispute Resolved', `
<p style="color:#44403c;line-height:1.6">Hi ${recipient},</p>
<p style="color:#44403c;line-height:1.6">A PetLink mediator has resolved the dispute on your booking.</p>
<div style="background:#ecfdf5;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #059669">
<p style="margin:0 0 4px;color:#78716c;font-size:13px">Resolution</p>
<p style="margin:0;font-weight:600;color:#059669">${escapeHtml(label)}</p>
${params.refundAmount ? `<p style="margin:4px 0 0;color:#1c1917;font-size:14px">Refund: ${escapeHtml(params.refundAmount)}</p>` : ''}
</div>
<div style="background:#fafaf9;border-radius:8px;padding:16px;margin:16px 0">
<p style="margin:0 0 4px;color:#78716c;font-size:13px">Notes</p>
<p style="margin:0;color:#1c1917;font-size:14px;line-height:1.5">${escapeHtml(params.resolutionNotes.slice(0, 500))}${params.resolutionNotes.length > 500 ? '...' : ''}</p>
</div>
`),
  };
}

export function buildIncidentReportEmail(params: {
  recipientName: string;
  reporterName: string;
  category: string;
  description: string;
  bookingId: number;
}): { subject: string; html: string } {
  const recipient = escapeHtml(params.recipientName);
  const reporter = escapeHtml(params.reporterName);
  const categoryLabel = getIncidentCategoryLabel(params.category);
  const desc = escapeHtml(params.description.slice(0, 300));

  return {
    subject: sanitizeSubject(`Incident Report — ${categoryLabel}`),
    html: emailWrapper('Incident Reported', `
<p style="color:#44403c;line-height:1.6">Hi ${recipient},</p>
<p style="color:#44403c;line-height:1.6"><strong>${reporter}</strong> has filed an incident report on a booking with you.</p>
<div style="background:#fef2f2;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #dc2626">
<p style="margin:0 0 4px;color:#78716c;font-size:13px">Category</p>
<p style="margin:0;font-weight:600;color:#dc2626">${escapeHtml(categoryLabel)}</p>
</div>
<div style="background:#fafaf9;border-radius:8px;padding:16px;margin:16px 0">
<p style="margin:0 0 4px;color:#78716c;font-size:13px">Description</p>
<p style="margin:0;color:#1c1917;font-size:14px;line-height:1.5">${desc}${params.description.length > 300 ? '...' : ''}</p>
</div>
<div style="text-align:center;margin:24px 0">
<a href="${process.env.APP_URL || 'https://petlink.app'}/home" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">View Details</a>
</div>
<p style="color:#a8a29e;font-size:12px">If you have questions, please contact PetLink support.</p>
`),
  };
}

export function buildDepositCreditReminderEmail(params: {
  ownerName: string;
  sitterName: string;
  creditCents: number;
  daysRemaining: number;
  sitterId: number;
}): { subject: string; html: string } {
  const owner = escapeHtml(params.ownerName);
  const sitter = escapeHtml(params.sitterName);
  const amount = `$${(params.creditCents / 100).toFixed(2)}`;
  const urgency = params.daysRemaining <= 5
    ? `<p style="color:#dc2626;font-weight:600;font-size:14px">Only ${params.daysRemaining} day${params.daysRemaining !== 1 ? 's' : ''} left!</p>`
    : `<p style="color:#78716c;font-size:14px">Expires in ${params.daysRemaining} days.</p>`;

  return {
    subject: sanitizeSubject(`Your ${amount} credit with ${params.sitterName} is waiting`),
    html: emailWrapper('Your Meet & Greet Credit', `
<p style="color:#44403c;line-height:1.6">Hi ${owner},</p>
<p style="color:#44403c;line-height:1.6">You have a <strong style="color:#059669">${amount} credit</strong> from your meet & greet with <strong>${sitter}</strong>. Book a service to use it!</p>
${urgency}
<div style="text-align:center;margin:24px 0">
<a href="${process.env.APP_URL || 'https://petlink.app'}/sitter/${params.sitterId}" style="display:inline-block;background:#059669;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">Book ${sitter} Now</a>
</div>
<p style="color:#a8a29e;font-size:12px">If you don't book within the credit window, the deposit will be released to the sitter as compensation for their time.</p>
`),
  };
}

export function buildReservationProtectionEmail(params: {
  ownerName: string;
  originalSitterName: string;
  startTime: string;
  replacementSitters: { name: string; priceCents: number; profileUrl: string; avgRating: number | null }[];
  noAlternatives: boolean;
}): { subject: string; html: string } {
  const owner = escapeHtml(params.ownerName);
  const sitter = escapeHtml(params.originalSitterName);

  const sitterRows = params.replacementSitters.map(s => `
    <div style="background:#f5f5f4;border-radius:12px;padding:16px;margin:8px 0;display:flex;justify-content:space-between;align-items:center">
      <div>
        <strong style="color:#1c1917">${escapeHtml(s.name)}</strong>
        ${s.avgRating ? `<span style="color:#78716c;font-size:13px"> — ${s.avgRating} stars</span>` : ''}
        <div style="color:#78716c;font-size:13px">$${(s.priceCents / 100).toFixed(2)}/session</div>
      </div>
      <a href="${escapeHtml(s.profileUrl)}" style="background:#059669;color:#fff;padding:8px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">View Profile</a>
    </div>
  `).join('');

  const content = params.noAlternatives
    ? `
<p style="color:#44403c;line-height:1.6">Hi ${owner},</p>
<p style="color:#44403c;line-height:1.6">Unfortunately, <strong>${sitter}</strong> had to cancel your upcoming booking. We've issued a full refund and are looking for alternatives in your area.</p>
<p style="color:#44403c;line-height:1.6">We'll notify you if we find a match. You can also search for available sitters yourself.</p>
<div style="text-align:center;margin:24px 0">
<a href="${process.env.APP_URL || 'https://petlink.app'}/search" style="display:inline-block;background:#059669;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">Search Sitters</a>
</div>
`
    : `
<p style="color:#44403c;line-height:1.6">Hi ${owner},</p>
<p style="color:#44403c;line-height:1.6">Unfortunately, <strong>${sitter}</strong> had to cancel your upcoming booking. We've issued a full refund and found ${params.replacementSitters.length} alternative sitter${params.replacementSitters.length !== 1 ? 's' : ''} for you:</p>
${sitterRows}
<p style="color:#78716c;font-size:13px;margin-top:16px">If the replacement costs more, we'll credit the difference to your account.</p>
`;

  return {
    subject: sanitizeSubject(
      params.noAlternatives
        ? 'Your sitter cancelled — we\'re searching for alternatives'
        : `Your sitter cancelled — we found ${params.replacementSitters.length} alternative${params.replacementSitters.length !== 1 ? 's' : ''}`
    ),
    html: emailWrapper('Reservation Protection', content),
  };
}

export function buildCreditLowWarningEmail(params: {
  sitterName: string;
  balanceCents: number;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const name = escapeHtml(params.sitterName);
  const amount = `$${(params.balanceCents / 100).toFixed(2)}`;

  return {
    subject: sanitizeSubject(`Your PetLink credit balance is running low (${amount} remaining)`),
    html: emailWrapper('Credits Running Low', `
<p style="color:#44403c;line-height:1.6">Hi ${name},</p>
<p style="color:#44403c;line-height:1.6">Your PetLink credit balance is <strong style="color:#d97706">${amount}</strong>. Once your credits are used up, your subscription will be charged at the regular rate.</p>
<p style="color:#44403c;line-height:1.6">Pro sitters keep 100% of their earnings with zero platform fees — the math speaks for itself.</p>
<div style="text-align:center;margin:24px 0">
<a href="${escapeHtml(params.dashboardUrl)}" style="display:inline-block;background:#059669;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">View Your Credits</a>
</div>
<p style="color:#a8a29e;font-size:12px">Questions about your subscription? Contact PetLink support.</p>
`),
  };
}

export function buildFoundingSitterWelcomeEmail(params: {
  sitterName: string;
  creditAmountCents: number;
  cohort: string;
}): { subject: string; html: string } {
  const name = escapeHtml(params.sitterName);
  const amount = `$${(params.creditAmountCents / 100).toFixed(2)}`;
  const cohortLabel = params.cohort === 'founding' ? 'Founding Sitter' : params.cohort === 'early_beta' ? 'Early Beta Sitter' : 'Sitter';
  const badgeHtml = params.cohort === 'founding'
    ? '<span style="display:inline-block;background:#d1fae5;color:#065f46;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600">&#127775; Founding Sitter</span>'
    : '';

  return {
    subject: sanitizeSubject(`Welcome to PetLink, ${params.sitterName}! You've received ${amount} in credits`),
    html: emailWrapper(`Welcome, ${cohortLabel}!`, `
<p style="color:#44403c;line-height:1.6">Hi ${name},</p>
<p style="color:#44403c;line-height:1.6">Thank you for being one of our earliest sitters. We've added <strong style="color:#059669">${amount} in platform credits</strong> to your account.</p>
${badgeHtml ? `<div style="text-align:center;margin:16px 0">${badgeHtml}</div>` : ''}
<p style="color:#44403c;line-height:1.6">These credits will automatically apply to your Pro subscription renewals — so you'll enjoy zero platform fees while your credits last.</p>
<ul style="color:#44403c;line-height:1.8;padding-left:20px">
<li><strong>0% platform fee</strong> on every booking</li>
<li><strong>Priority search placement</strong></li>
<li><strong>Full analytics dashboard</strong></li>
${params.cohort === 'founding' ? '<li><strong>Permanent Founding Sitter badge</strong> on your profile</li>' : ''}
</ul>
<div style="text-align:center;margin:24px 0">
<a href="${process.env.APP_URL || 'https://petlink.app'}/profile" style="display:inline-block;background:#059669;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">Set Up Your Profile</a>
</div>
<p style="color:#a8a29e;font-size:12px">Your credits never expire. They'll automatically apply at each subscription renewal.</p>
`),
  };
}

export function buildCouponRedemptionEmail(params: {
  userName: string;
  offerTitle: string;
  couponCode: string;
  partnerName: string;
  partnerWebsite?: string | null;
}): { subject: string; html: string } {
  const name = escapeHtml(params.userName);
  const code = escapeHtml(params.couponCode);
  const partner = escapeHtml(params.partnerName);

  return {
    subject: sanitizeSubject(`Your ${params.partnerName} coupon code is ready`),
    html: emailWrapper('Coupon Redeemed!', `
<p style="color:#44403c;line-height:1.6">Hi ${name},</p>
<p style="color:#44403c;line-height:1.6">You've redeemed <strong>${escapeHtml(params.offerTitle)}</strong> from ${partner}. Here's your coupon code:</p>
<div style="text-align:center;margin:24px 0;padding:16px;background:#f5f5f4;border-radius:12px;border:2px dashed #059669">
<span style="font-size:24px;font-weight:700;letter-spacing:4px;color:#059669">${code}</span>
</div>
${params.partnerWebsite ? `
<div style="text-align:center;margin:16px 0">
<a href="${escapeHtml(params.partnerWebsite)}" style="display:inline-block;background:#059669;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">Visit ${partner}</a>
</div>
` : ''}
<p style="color:#a8a29e;font-size:12px">This code was generated by PetLink. Contact ${partner} for redemption support.</p>
`),
  };
}

export function buildDormancyWarningEmail(params: {
  userName: string;
  balanceCents: number;
  reactivationDeadline: string;
  loginUrl: string;
}): { subject: string; html: string } {
  const name = escapeHtml(params.userName);
  const amount = `$${(params.balanceCents / 100).toFixed(2)}`;

  return {
    subject: sanitizeSubject(`Action needed: Your ${amount} PetLink credit balance`),
    html: emailWrapper('Account Activity Notice', `
<p style="color:#44403c;line-height:1.6">Hi ${name},</p>
<p style="color:#44403c;line-height:1.6">Your PetLink account has been inactive for an extended period. You have <strong style="color:#059669">${amount}</strong> in platform credits.</p>
<p style="color:#44403c;line-height:1.6">Per our Terms of Service, credits on accounts inactive for 36+ months may be forfeited. To keep your credits, simply log in before <strong>${escapeHtml(params.reactivationDeadline)}</strong>.</p>
<div style="text-align:center;margin:24px 0">
<a href="${escapeHtml(params.loginUrl)}" style="display:inline-block;background:#059669;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">Log In Now</a>
</div>
<p style="color:#a8a29e;font-size:12px">If you no longer wish to use PetLink, no action is needed. Your credits will be forfeited after the deadline.</p>
`),
  };
}

export function buildProTrialWarningEmail(params: {
  sitterName: string;
  daysRemaining: number;
  trialEndDate: string;
}): { subject: string; html: string } {
  const name = escapeHtml(params.sitterName);
  const daysText = params.daysRemaining === 1 ? 'Tomorrow' : `in ${params.daysRemaining} days`;

  return {
    subject: sanitizeSubject(`Your free Pro trial ends ${daysText}`),
    html: emailWrapper('Pro Trial Ending Soon', `
<p style="color:#44403c;line-height:1.6">Hi ${name},</p>
<p style="color:#44403c;line-height:1.6">Your free Pro trial ends <strong>${daysText}</strong> (${escapeHtml(params.trialEndDate)}).</p>
<p style="color:#44403c;line-height:1.6">After your trial, you'll move to the free tier with a <strong>15% platform fee</strong> on each booking. Subscribe to Pro ($19.99/mo) to keep:</p>
<ul style="color:#44403c;line-height:1.8;padding-left:20px">
<li><strong>0% platform fees</strong> — keep every dollar you earn</li>
<li><strong>Priority search placement</strong> — get seen first</li>
<li><strong>Full analytics dashboard</strong> — track your business</li>
<li><strong>Verified badge</strong> — build trust with owners</li>
</ul>
<div style="text-align:center;margin:24px 0">
<a href="${process.env.APP_URL || 'https://petlink.app'}/profile/subscription" style="display:inline-block;background:#059669;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">Subscribe to Pro — $19.99/mo</a>
</div>
<p style="color:#a8a29e;font-size:12px">No commitment — cancel anytime.</p>
`),
  };
}

export function buildBetaExpirationWarningEmail(params: {
  sitterName: string;
  daysRemaining: number;
  betaEndDate: string;
  isFounding: boolean;
}): { subject: string; html: string } {
  const name = escapeHtml(params.sitterName);
  const foundingNote = params.isFounding
    ? `<p style="color:#44403c;line-height:1.6">As a <strong style="color:#059669">Founding Sitter</strong>, you'll automatically receive <strong>6 months of free Pro</strong> when the beta ends. Your Founding Sitter badge is yours forever.</p>`
    : `<p style="color:#44403c;line-height:1.6">After the beta, you can continue with a <strong>Pro subscription ($19.99/mo)</strong> to keep 0% platform fees, or switch to the free tier.</p>`;

  return {
    subject: sanitizeSubject(`Beta program ends in ${params.daysRemaining} days`),
    html: emailWrapper('Beta Program Update', `
<p style="color:#44403c;line-height:1.6">Hi ${name},</p>
<p style="color:#44403c;line-height:1.6">The PetLink beta program ends on <strong>${escapeHtml(params.betaEndDate)}</strong> (${params.daysRemaining} days from now).</p>
${foundingNote}
<p style="color:#44403c;line-height:1.6">Thank you for being part of our early community — your feedback has shaped PetLink into what it is today. 🙏</p>
<div style="text-align:center;margin:24px 0">
<a href="${process.env.APP_URL || 'https://petlink.app'}/profile/subscription" style="display:inline-block;background:#059669;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">View Your Subscription</a>
</div>
`),
  };
}

export function buildProPeriodExpiredEmail(params: {
  userName: string;
  source: string;
}): { subject: string; html: string } {
  const name = escapeHtml(params.userName);
  const sourceLabel = params.source === 'beta' ? 'beta' : params.source === 'beta_transition' ? 'free Pro' : 'Pro trial';

  return {
    subject: sanitizeSubject(`Your ${sourceLabel} period has ended`),
    html: emailWrapper('Pro Access Ended', `
<p style="color:#44403c;line-height:1.6">Hi ${name},</p>
<p style="color:#44403c;line-height:1.6">Your ${sourceLabel} period has ended. You're now on the <strong>free tier</strong> with a 15% platform fee on each booking.</p>
<p style="color:#44403c;line-height:1.6">Upgrade to Pro ($19.99/mo) to get back to <strong>0% platform fees</strong>, priority search placement, and full analytics.</p>
<div style="text-align:center;margin:24px 0">
<a href="${process.env.APP_URL || 'https://petlink.app'}/profile/subscription" style="display:inline-block;background:#059669;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">Upgrade to Pro — $19.99/mo</a>
</div>
<p style="color:#a8a29e;font-size:12px">No commitment — cancel anytime.</p>
`),
  };
}

export function buildDormancyForfeitureEmail(params: {
  userName: string;
  forfeitedAmountCents: number;
}): { subject: string; html: string } {
  const name = escapeHtml(params.userName);
  const amount = `$${(params.forfeitedAmountCents / 100).toFixed(2)}`;

  return {
    subject: sanitizeSubject(`Your PetLink credits (${amount}) have been forfeited`),
    html: emailWrapper('Credits Forfeited', `
<p style="color:#44403c;line-height:1.6">Hi ${name},</p>
<p style="color:#44403c;line-height:1.6">Your PetLink account has been inactive for over 36 months. As outlined in our Terms of Service, your <strong>${amount}</strong> in platform credits has been forfeited due to account dormancy.</p>
<p style="color:#44403c;line-height:1.6">If you'd like to return to PetLink, you're always welcome. Your account is still active — just log in anytime.</p>
<div style="text-align:center;margin:24px 0">
<a href="${process.env.APP_URL || 'https://petlink.app'}/login" style="display:inline-block;background:#059669;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">Log In to PetLink</a>
</div>
<p style="color:#a8a29e;font-size:12px">For questions, contact PetLink support.</p>
`),
  };
}
