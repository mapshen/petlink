import { OAuth2Client } from 'google-auth-library';
import appleSignin from 'apple-signin-auth';

export interface OAuthProfile {
  provider: string;
  providerId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

let googleClient: OAuth2Client | null = null;

export async function verifyGoogleToken(idToken: string): Promise<OAuthProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID environment variable is not configured');
  }

  if (!googleClient) {
    googleClient = new OAuth2Client(clientId);
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: clientId,
  });
  const payload = ticket.getPayload();

  if (!payload) {
    throw new Error('Google token verification failed: no payload');
  }

  return {
    provider: 'google',
    providerId: payload.sub,
    email: payload.email ?? null,
    emailVerified: payload.email_verified ?? false,
    name: payload.name ?? null,
    avatarUrl: payload.picture ?? null,
  };
}

export async function verifyAppleToken(idToken: string): Promise<OAuthProfile> {
  const clientId = process.env.APPLE_CLIENT_ID || process.env.VITE_APPLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('APPLE_CLIENT_ID environment variable is not configured');
  }

  const payload = await appleSignin.verifyIdToken(idToken, {
    audience: clientId,
  });

  return {
    provider: 'apple',
    providerId: payload.sub,
    email: payload.email ?? null,
    emailVerified: payload.email_verified === 'true' || payload.email_verified === true,
    name: null,
    avatarUrl: null,
  };
}

export async function verifyFacebookToken(accessToken: string): Promise<OAuthProfile> {
  const appId = process.env.FACEBOOK_APP_ID || process.env.VITE_FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be configured');
  }

  // Verify token was issued for OUR app
  const debugRes = await fetch(
    `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`
  );
  if (!debugRes.ok) {
    throw new Error('Facebook token verification failed: unable to validate token');
  }
  const debugData = await debugRes.json();
  if (!debugData.data?.is_valid || debugData.data.app_id !== appId) {
    throw new Error('Facebook token is not valid for this application');
  }

  // Fetch profile
  const response = await fetch(
    `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${accessToken}`
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Facebook token verification failed: ${errorBody}`);
  }

  const data = await response.json();

  if (!data.id) {
    throw new Error('Facebook token verification failed: no user ID returned');
  }

  return {
    provider: 'facebook',
    providerId: data.id,
    email: data.email ?? null,
    emailVerified: false, // Facebook does not reliably report email verification
    name: data.name ?? null,
    avatarUrl: data.picture?.data?.url ?? null,
  };
}

export async function verifyOAuthToken(provider: string, token: string): Promise<OAuthProfile> {
  switch (provider) {
    case 'google':
      return verifyGoogleToken(token);
    case 'apple':
      return verifyAppleToken(token);
    case 'facebook':
      return verifyFacebookToken(token);
    default:
      throw new Error(`Unknown OAuth provider: ${provider}`);
  }
}
