import { OAuth2Client } from 'google-auth-library';
import appleSignin from 'apple-signin-auth';

export interface OAuthProfile {
  provider: string;
  providerId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export async function verifyGoogleToken(idToken: string): Promise<OAuthProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID environment variable is not configured');
  }

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
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
    name: payload.name ?? null,
    avatarUrl: payload.picture ?? null,
  };
}

export async function verifyAppleToken(idToken: string): Promise<OAuthProfile> {
  const clientId = process.env.APPLE_CLIENT_ID;
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
    name: null,
    avatarUrl: null,
  };
}

export async function verifyFacebookToken(accessToken: string): Promise<OAuthProfile> {
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
