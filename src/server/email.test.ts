import { describe, it, expect } from 'vitest';
import {
  buildBookingConfirmationEmail,
  buildBookingStatusEmail,
  buildNewMessageEmail,
  buildSitterNewBookingEmail,
  buildOwnerWelcomeEmail,
  buildSitterWelcomeEmail,
  buildLostPetAlertEmail,
  buildLostPetResolvedEmail,
  escapeHtml,
} from './email.ts';

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('escapes ampersands and quotes', () => {
    expect(escapeHtml("Tom & Jerry's \"Café\"")).toBe('Tom &amp; Jerry&#39;s &quot;Café&quot;');
  });

  it('passes through safe strings unchanged', () => {
    expect(escapeHtml('Alice Smith')).toBe('Alice Smith');
  });
});

describe('email templates', () => {
  describe('buildBookingConfirmationEmail', () => {
    it('generates correct subject and HTML for booking confirmation', () => {
      const result = buildBookingConfirmationEmail({
        ownerName: 'Alice',
        sitterName: 'Bob',
        serviceName: 'Dog Walking',
        startTime: 'March 5, 2026 at 10:00 AM',
        totalPriceCents: 2500,
      });
      expect(result.subject).toBe('Booking Request Submitted — Dog Walking with Bob');
      expect(result.html).toContain('Hi Alice');
      expect(result.html).toContain('Bob');
      expect(result.html).toContain('Dog Walking');
      expect(result.html).toContain('$25.00');
      expect(result.html).toContain('March 5, 2026 at 10:00 AM');
      expect(result.html).toContain('PetLink');
    });

    it('displays "Free" for zero-price bookings', () => {
      const result = buildBookingConfirmationEmail({
        ownerName: 'Alice',
        sitterName: 'Bob',
        serviceName: 'Meet & Greet',
        startTime: 'March 5, 2026',
        totalPriceCents: 0,
      });
      expect(result.html).toContain('Free');
      expect(result.html).not.toContain('$0.00');
    });

    it('formats price with two decimals', () => {
      const result = buildBookingConfirmationEmail({
        ownerName: 'Alice',
        sitterName: 'Bob',
        serviceName: 'Sitting',
        startTime: 'March 5, 2026',
        totalPriceCents: 3000,
      });
      expect(result.html).toContain('$30.00');
    });
  });

  describe('buildBookingStatusEmail', () => {
    it('generates confirmed email', () => {
      const result = buildBookingStatusEmail({
        recipientName: 'Alice',
        otherPartyName: 'Bob',
        status: 'confirmed',
        serviceName: 'Dog Walking',
        startTime: 'March 5, 2026',
      });
      expect(result.subject).toBe('Booking Confirmed — Dog Walking');
      expect(result.html).toContain('Confirmed');
      expect(result.html).toContain('has been confirmed');
      expect(result.html).toContain('#059669'); // green color
    });

    it('generates cancelled email', () => {
      const result = buildBookingStatusEmail({
        recipientName: 'Alice',
        otherPartyName: 'Bob',
        status: 'cancelled',
        serviceName: 'Dog Walking',
        startTime: 'March 5, 2026',
      });
      expect(result.subject).toBe('Booking Cancelled — Dog Walking');
      expect(result.html).toContain('Cancelled');
      expect(result.html).toContain('has been cancelled');
      expect(result.html).toContain('#dc2626'); // red color
    });
  });

  describe('buildNewMessageEmail', () => {
    it('generates message notification email', () => {
      const result = buildNewMessageEmail({
        recipientName: 'Alice',
        senderName: 'Bob',
        messagePreview: 'Can you walk my dog tomorrow?',
      });
      expect(result.subject).toBe('New message from Bob');
      expect(result.html).toContain('Hi Alice');
      expect(result.html).toContain('Bob');
      expect(result.html).toContain('Can you walk my dog tomorrow?');
    });
  });

  describe('buildSitterNewBookingEmail', () => {
    it('generates sitter notification for new booking', () => {
      const result = buildSitterNewBookingEmail({
        sitterName: 'Bob',
        ownerName: 'Alice',
        serviceName: 'Dog Walking',
        startTime: 'March 5, 2026 at 10:00 AM',
        totalPriceCents: 2500,
      });
      expect(result.subject).toBe('New Booking Request from Alice');
      expect(result.html).toContain('Hi Bob');
      expect(result.html).toContain('Alice');
      expect(result.html).toContain('Dog Walking');
      expect(result.html).toContain('$25.00');
    });

    it('displays "Free" for zero-price sitter notifications', () => {
      const result = buildSitterNewBookingEmail({
        sitterName: 'Bob',
        ownerName: 'Alice',
        serviceName: 'Meet & Greet',
        startTime: 'March 5, 2026',
        totalPriceCents: 0,
      });
      expect(result.html).toContain('Free');
      expect(result.html).not.toContain('$0.00');
    });
  });

  describe('buildOwnerWelcomeEmail', () => {
    it('returns correct subject', () => {
      const result = buildOwnerWelcomeEmail({ ownerName: 'Alice' });
      expect(result.subject).toBe('Welcome to PetLink!');
    });

    it('HTML contains owner name and search link', () => {
      const result = buildOwnerWelcomeEmail({ ownerName: 'Alice' });
      expect(result.html).toContain('Hi Alice');
      expect(result.html).toContain('https://petlink.app/search');
      expect(result.html).toContain('Find a Sitter');
    });

    it('HTML-escapes special characters in name', () => {
      const result = buildOwnerWelcomeEmail({ ownerName: '<b>Evil</b>' });
      expect(result.html).not.toContain('<b>Evil</b>');
      expect(result.html).toContain('&lt;b&gt;Evil&lt;/b&gt;');
    });
  });

  describe('buildSitterWelcomeEmail', () => {
    it('returns correct subject', () => {
      const result = buildSitterWelcomeEmail({ sitterName: 'Bob' });
      expect(result.subject).toBe('Welcome to PetLink — Next Steps');
    });

    it('HTML contains sitter name, profile link, and mentions approval', () => {
      const result = buildSitterWelcomeEmail({ sitterName: 'Bob' });
      expect(result.html).toContain('Hi Bob');
      expect(result.html).toContain('https://petlink.app/profile');
      expect(result.html).toContain('Complete Your Profile');
      expect(result.html).toContain('pending approval');
    });

    it('HTML-escapes special characters in name', () => {
      const result = buildSitterWelcomeEmail({ sitterName: "O'Malley & Co" });
      expect(result.html).not.toContain("O'Malley & Co");
      expect(result.html).toContain('O&#39;Malley &amp; Co');
    });
  });

  describe('email HTML structure', () => {
    it('wraps content in valid HTML with PetLink branding', () => {
      const result = buildBookingConfirmationEmail({
        ownerName: 'Test',
        sitterName: 'Test',
        serviceName: 'Test',
        startTime: 'Test',
        totalPriceCents: 0,
      });
      expect(result.html).toContain('<!DOCTYPE html>');
      expect(result.html).toContain('<html lang="en">');
      expect(result.html).toContain('PetLink');
      expect(result.html).toContain('email notifications enabled');
    });
  });

  describe('XSS protection', () => {
    it('escapes HTML in user names', () => {
      const result = buildBookingConfirmationEmail({
        ownerName: '<script>alert(1)</script>',
        sitterName: 'Bob',
        serviceName: 'Walking',
        startTime: 'March 5',
        totalPriceCents: 2500,
      });
      expect(result.html).not.toContain('<script>');
      expect(result.html).toContain('&lt;script&gt;');
    });

    it('escapes HTML in message preview', () => {
      const result = buildNewMessageEmail({
        recipientName: 'Alice',
        senderName: 'Bob',
        messagePreview: '<img src=x onerror=alert(1)>',
      });
      expect(result.html).not.toContain('<img');
      expect(result.html).toContain('&lt;img');
    });

    it('sanitizes newlines in subject lines', () => {
      const result = buildNewMessageEmail({
        recipientName: 'Alice',
        senderName: 'Bob\r\nBCC: attacker@evil.com',
        messagePreview: 'Hello',
      });
      expect(result.subject).not.toContain('\r');
      expect(result.subject).not.toContain('\n');
    });
  });

  describe('buildLostPetAlertEmail', () => {
    it('generates correct subject and HTML', () => {
      const result = buildLostPetAlertEmail({
        sitterName: 'Bob',
        ownerName: 'Alice',
        petName: 'Buddy',
        petSpecies: 'dog',
        description: 'Last seen near Central Park',
        lastSeenAt: 'April 6, 2026 at 2:00 PM',
        contactPhone: '555-0123',
        alertId: 1,
      });
      expect(result.subject).toBe('Lost Pet Alert — Buddy is missing');
      expect(result.html).toContain('Hi Bob');
      expect(result.html).toContain('Alice');
      expect(result.html).toContain('Buddy');
      expect(result.html).toContain('dog');
      expect(result.html).toContain('Central Park');
      expect(result.html).toContain('555-0123');
    });

    it('escapes HTML in user input', () => {
      const result = buildLostPetAlertEmail({
        sitterName: '<script>Bob</script>',
        ownerName: 'Alice',
        petName: 'Buddy',
        petSpecies: 'dog',
        description: '<img onerror=alert(1)>',
        lastSeenAt: '2026-04-06',
        alertId: 1,
      });
      expect(result.html).not.toContain('<script>');
      expect(result.html).not.toContain('<img');
    });

    it('omits contact row when no phone', () => {
      const result = buildLostPetAlertEmail({
        sitterName: 'Bob',
        ownerName: 'Alice',
        petName: 'Buddy',
        petSpecies: 'dog',
        description: 'Lost near the park area east',
        lastSeenAt: '2026-04-06',
        alertId: 1,
      });
      expect(result.html).not.toContain('Contact');
    });

    it('truncates long descriptions', () => {
      const longDesc = 'A'.repeat(600);
      const result = buildLostPetAlertEmail({
        sitterName: 'Bob',
        ownerName: 'Alice',
        petName: 'Buddy',
        petSpecies: 'dog',
        description: longDesc,
        lastSeenAt: '2026-04-06',
        alertId: 1,
      });
      // The escaped output should contain at most 500 A's
      const escapedAs = result.html.match(/A{500}/);
      expect(escapedAs).toBeTruthy();
      expect(result.html).not.toContain('A'.repeat(501));
    });
  });

  describe('buildLostPetResolvedEmail', () => {
    it('generates found email', () => {
      const result = buildLostPetResolvedEmail({
        sitterName: 'Bob',
        petName: 'Buddy',
        status: 'found',
      });
      expect(result.subject).toContain('Found');
      expect(result.html).toContain('found safe and sound');
      expect(result.html).toContain('Hi Bob');
    });

    it('generates cancelled email', () => {
      const result = buildLostPetResolvedEmail({
        sitterName: 'Bob',
        petName: 'Buddy',
        status: 'cancelled',
      });
      expect(result.subject).toContain('Alert Cancelled');
      expect(result.html).toContain('cancelled by the owner');
    });
  });
});
