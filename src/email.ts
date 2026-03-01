import { Resend } from 'resend';

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
  totalPrice: number;
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
<tr style="border-top:1px solid #e7e5e4"><td style="padding:8px 0;color:#78716c;font-size:14px;font-weight:600">Total</td><td style="padding:8px 0;color:#059669;font-size:14px;font-weight:600;text-align:right">${params.totalPrice === 0 ? 'Free' : `$${params.totalPrice.toFixed(2)}`}</td></tr>
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

export function buildSitterNewBookingEmail(params: {
  sitterName: string;
  ownerName: string;
  serviceName: string;
  startTime: string;
  totalPrice: number;
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
<tr style="border-top:1px solid #e7e5e4"><td style="padding:8px 0;color:#78716c;font-size:14px;font-weight:600">Price</td><td style="padding:8px 0;color:#059669;font-size:14px;font-weight:600;text-align:right">${params.totalPrice === 0 ? 'Free' : `$${params.totalPrice.toFixed(2)}`}</td></tr>
</table>
<p style="color:#78716c;font-size:14px">Log in to PetLink to accept or decline.</p>
`),
  };
}
