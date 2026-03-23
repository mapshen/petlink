import { describe, it, expect, vi, beforeEach } from 'vitest';

const { googleVerifyIdToken, appleVerifyIdToken } = vi.hoisted(() => ({
  googleVerifyIdToken: vi.fn(),
  appleVerifyIdToken: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class MockOAuth2Client {
    verifyIdToken = googleVerifyIdToken;
  },
}));

vi.mock('apple-signin-auth', () => ({
  default: { verifyIdToken: appleVerifyIdToken },
}));

import { verifyGoogleToken, verifyAppleToken, verifyFacebookToken, verifyOAuthToken } from './oauth.ts';

describe('verifyGoogleToken', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-google-client-id');
    googleVerifyIdToken.mockReset();
  });

  it('returns correct OAuthProfile with valid token', async () => {
    googleVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        sub: 'google-user-123',
        email: 'user@gmail.com',
        email_verified: true,
        name: 'Test User',
        picture: 'https://example.com/photo.jpg',
      }),
    });

    const result = await verifyGoogleToken('valid-google-token');

    expect(result).toEqual({
      provider: 'google',
      providerId: 'google-user-123',
      email: 'user@gmail.com',
      emailVerified: true,
      name: 'Test User',
      avatarUrl: 'https://example.com/photo.jpg',
    });
  });

  it('sets emailVerified false when not provided', async () => {
    googleVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        sub: 'google-user-123',
        email: 'user@gmail.com',
      }),
    });

    const result = await verifyGoogleToken('valid-google-token');
    expect(result.emailVerified).toBe(false);
  });

  it('throws with invalid token', async () => {
    googleVerifyIdToken.mockRejectedValueOnce(new Error('Invalid token'));

    await expect(verifyGoogleToken('invalid-token')).rejects.toThrow('Invalid token');
  });
});

describe('verifyAppleToken', () => {
  beforeEach(() => {
    vi.stubEnv('APPLE_CLIENT_ID', 'test-apple-client-id');
    appleVerifyIdToken.mockReset();
  });

  it('returns correct OAuthProfile with valid token', async () => {
    appleVerifyIdToken.mockResolvedValueOnce({
      sub: 'apple-user-456',
      email: 'user@icloud.com',
      email_verified: 'true',
    });

    const result = await verifyAppleToken('valid-apple-token');

    expect(result).toEqual({
      provider: 'apple',
      providerId: 'apple-user-456',
      email: 'user@icloud.com',
      emailVerified: true,
      name: null,
      avatarUrl: null,
    });
  });

  it('throws with invalid token', async () => {
    appleVerifyIdToken.mockRejectedValueOnce(new Error('Apple token invalid'));

    await expect(verifyAppleToken('invalid-token')).rejects.toThrow('Apple token invalid');
  });
});

describe('verifyFacebookToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('FACEBOOK_APP_ID', 'test-fb-app-id');
    vi.stubEnv('FACEBOOK_APP_SECRET', 'test-fb-app-secret');
  });

  it('returns correct OAuthProfile with valid token', async () => {
    vi.spyOn(globalThis, 'fetch')
      // debug_token call
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({
          data: { is_valid: true, app_id: 'test-fb-app-id' },
        }),
      } as any)
      // profile call
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({
          id: 'fb-user-789',
          name: 'FB User',
          email: 'user@facebook.com',
          picture: { data: { url: 'https://facebook.com/photo.jpg' } },
        }),
      } as any);

    const result = await verifyFacebookToken('valid-fb-token');

    expect(result).toEqual({
      provider: 'facebook',
      providerId: 'fb-user-789',
      email: 'user@facebook.com',
      emailVerified: false,
      name: 'FB User',
      avatarUrl: 'https://facebook.com/photo.jpg',
    });
  });

  it('throws when token is for wrong app', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce({
        data: { is_valid: true, app_id: 'wrong-app-id' },
      }),
    } as any);

    await expect(verifyFacebookToken('stolen-token')).rejects.toThrow(
      'Facebook token is not valid for this application'
    );
  });

  it('throws when Facebook API returns error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      text: vi.fn().mockResolvedValueOnce('error'),
    } as any);

    await expect(verifyFacebookToken('invalid-token')).rejects.toThrow(
      'Facebook token verification failed'
    );
  });
});

describe('verifyOAuthToken', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-google-client-id');
    vi.stubEnv('APPLE_CLIENT_ID', 'test-apple-client-id');
    vi.stubEnv('FACEBOOK_APP_ID', 'test-fb-app-id');
    vi.stubEnv('FACEBOOK_APP_SECRET', 'test-fb-app-secret');
    googleVerifyIdToken.mockReset();
    appleVerifyIdToken.mockReset();
  });

  it('routes to Google verifier', async () => {
    googleVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        sub: 'g-123',
        email: 'test@gmail.com',
        name: 'Test',
        picture: null,
      }),
    });

    const result = await verifyOAuthToken('google', 'token');
    expect(result.provider).toBe('google');
  });

  it('routes to Apple verifier', async () => {
    appleVerifyIdToken.mockResolvedValueOnce({
      sub: 'a-456',
      email: 'test@icloud.com',
    });

    const result = await verifyOAuthToken('apple', 'token');
    expect(result.provider).toBe('apple');
  });

  it('routes to Facebook verifier', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({
          data: { is_valid: true, app_id: 'test-fb-app-id' },
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({
          id: 'fb-999',
          name: 'FB Test',
          email: 'test@fb.com',
          picture: { data: { url: 'https://fb.com/pic.jpg' } },
        }),
      } as any);

    const result = await verifyOAuthToken('facebook', 'token');
    expect(result.provider).toBe('facebook');
  });

  it('throws for unknown provider', async () => {
    await expect(verifyOAuthToken('twitter', 'token')).rejects.toThrow(
      'Unknown OAuth provider: twitter'
    );
  });
});
