import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { OAuthProvider } from '../types';
import { Loader2 } from 'lucide-react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const APPLE_CLIENT_ID = import.meta.env.VITE_APPLE_CLIENT_ID;
const FACEBOOK_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID;

interface OAuthButtonsProps {
  onSuccess: (result: { isNewUser: boolean }) => void;
  onError: (error: string) => void;
}

export default function OAuthButtons({ onSuccess, onError }: OAuthButtonsProps) {
  const { loginWithOAuth } = useAuth();
  const [loadingProvider, setLoadingProvider] = useState<OAuthProvider | null>(null);

  const handleOAuth = async (provider: OAuthProvider, token: string) => {
    setLoadingProvider(provider);
    try {
      const result = await loginWithOAuth(provider, token);
      onSuccess(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'OAuth login failed');
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleGoogle = () => {
    if (!GOOGLE_CLIENT_ID) {
      onError('Google sign-in is not configured.');
      return;
    }
    setLoadingProvider('google');

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      const google = (window as unknown as Record<string, unknown>).google as {
        accounts: {
          id: {
            initialize: (config: Record<string, unknown>) => void;
            prompt: (callback?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void;
          };
        };
      };
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: { credential: string }) => {
          handleOAuth('google', response.credential);
        },
      });
      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          setLoadingProvider(null);
          onError('Google sign-in popup was blocked or dismissed. Please try again.');
        }
      });
    };
    script.onerror = () => {
      setLoadingProvider(null);
      onError('Failed to load Google sign-in. Please try email/password instead.');
    };
    document.body.appendChild(script);
  };

  const handleApple = () => {
    if (!APPLE_CLIENT_ID) {
      onError('Apple sign-in is not configured.');
      return;
    }
    setLoadingProvider('apple');

    const script = document.createElement('script');
    script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
    script.async = true;
    script.onload = () => {
      const AppleID = (window as unknown as Record<string, unknown>).AppleID as {
        auth: {
          init: (config: Record<string, unknown>) => void;
          signIn: () => Promise<{ authorization: { id_token: string } }>;
        };
      };
      AppleID.auth.init({
        clientId: APPLE_CLIENT_ID,
        scope: 'name email',
        redirectURI: window.location.origin,
        usePopup: true,
      });
      AppleID.auth.signIn()
        .then((response) => {
          handleOAuth('apple', response.authorization.id_token);
        })
        .catch(() => {
          setLoadingProvider(null);
          onError('Apple sign-in was cancelled.');
        });
    };
    script.onerror = () => {
      setLoadingProvider(null);
      onError('Failed to load Apple sign-in. Please try email/password instead.');
    };
    document.body.appendChild(script);
  };

  const handleFacebook = () => {
    if (!FACEBOOK_APP_ID) {
      onError('Facebook sign-in is not configured.');
      return;
    }
    setLoadingProvider('facebook');

    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.onload = () => {
      const FB = (window as unknown as Record<string, unknown>).FB as {
        init: (config: Record<string, unknown>) => void;
        login: (callback: (response: { authResponse?: { accessToken: string } }) => void, options: Record<string, unknown>) => void;
      };
      FB.init({
        appId: FACEBOOK_APP_ID,
        cookie: true,
        xfbml: false,
        version: 'v19.0',
      });
      FB.login(
        (response) => {
          if (response.authResponse) {
            handleOAuth('facebook', response.authResponse.accessToken);
          } else {
            setLoadingProvider(null);
            onError('Facebook sign-in was cancelled.');
          }
        },
        { scope: 'email,public_profile' }
      );
    };
    script.onerror = () => {
      setLoadingProvider(null);
      onError('Failed to load Facebook sign-in. Please try email/password instead.');
    };
    document.body.appendChild(script);
  };

  const isLoading = loadingProvider !== null;

  return (
    <div className="space-y-3">
      {/* Google */}
      {GOOGLE_CLIENT_ID && (
        <button
          type="button"
          onClick={handleGoogle}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors disabled:opacity-50"
        >
          {loadingProvider === 'google' ? (
            <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          <span className="text-sm font-medium text-stone-700">Continue with Google</span>
        </button>
      )}

      {/* Apple */}
      {APPLE_CLIENT_ID && (
        <button
          type="button"
          onClick={handleApple}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-black text-white rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-50"
        >
          {loadingProvider === 'apple' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
          )}
          <span className="text-sm font-medium">Continue with Apple</span>
        </button>
      )}

      {/* Facebook */}
      {FACEBOOK_APP_ID && (
        <button
          type="button"
          onClick={handleFacebook}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#1877F2] text-white rounded-lg hover:bg-[#166FE5] transition-colors disabled:opacity-50"
        >
          {loadingProvider === 'facebook' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          )}
          <span className="text-sm font-medium">Continue with Facebook</span>
        </button>
      )}

      {/* Fallback when no providers configured */}
      {!GOOGLE_CLIENT_ID && !APPLE_CLIENT_ID && !FACEBOOK_APP_ID && null}
    </div>
  );
}
