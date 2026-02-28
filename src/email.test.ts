import { describe, it, expect } from 'vitest';
import {
  buildBookingConfirmationEmail,
  buildBookingStatusEmail,
  buildNewMessageEmail,
  buildSitterNewBookingEmail,
} from './email.ts';

describe('email templates', () => {
  describe('buildBookingConfirmationEmail', () => {
    it('generates correct subject and HTML for booking confirmation', () => {
      const result = buildBookingConfirmationEmail({
        ownerName: 'Alice',
        sitterName: 'Bob',
        serviceName: 'Dog Walking',
        startTime: 'March 5, 2026 at 10:00 AM',
        totalPrice: 25.00,
      });
      expect(result.subject).toBe('Booking Confirmed — Dog Walking with Bob');
      expect(result.html).toContain('Hi Alice');
      expect(result.html).toContain('Bob');
      expect(result.html).toContain('Dog Walking');
      expect(result.html).toContain('$25.00');
      expect(result.html).toContain('March 5, 2026 at 10:00 AM');
      expect(result.html).toContain('PetLink');
    });

    it('formats price with two decimals', () => {
      const result = buildBookingConfirmationEmail({
        ownerName: 'Alice',
        sitterName: 'Bob',
        serviceName: 'Sitting',
        startTime: 'March 5, 2026',
        totalPrice: 30,
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
        totalPrice: 25.00,
      });
      expect(result.subject).toBe('New Booking Request from Alice');
      expect(result.html).toContain('Hi Bob');
      expect(result.html).toContain('Alice');
      expect(result.html).toContain('Dog Walking');
      expect(result.html).toContain('$25.00');
    });
  });

  describe('email HTML structure', () => {
    it('wraps content in valid HTML with PetLink branding', () => {
      const result = buildBookingConfirmationEmail({
        ownerName: 'Test',
        sitterName: 'Test',
        serviceName: 'Test',
        startTime: 'Test',
        totalPrice: 0,
      });
      expect(result.html).toContain('<!DOCTYPE html>');
      expect(result.html).toContain('PetLink');
      expect(result.html).toContain('email notifications enabled');
    });
  });
});
