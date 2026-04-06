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
