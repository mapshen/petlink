import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import OAuthButtons from '../../components/onboarding/OAuthButtons';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export default function Login() {
  useDocumentTitle('Login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const signupNameError = isSignup && name.trim().length === 0 ? 'Name is required' : null;
  const signupPasswordError =
    isSignup && password.length > 0 && password.length < 8
      ? 'Password must be at least 8 characters'
      : null;
  const isFormValid = isSignup
    ? email.length > 0 && name.trim().length > 0 && password.length >= 8 && ageConfirmed
    : email.length > 0 && password.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isSignup) {
      if (name.trim().length === 0) {
        setError('Name is required');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
    }

    try {
      if (isSignup) {
        await signup(email, password, name, ageConfirmed);
      } else {
        await login(email, password);
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    }
  };

  const handleOAuthSuccess = (result: { isNewUser: boolean }) => {
    navigate(result.isNewUser ? '/onboarding' : '/dashboard');
  };

  const hasOAuthProviders = !!(
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    import.meta.env.VITE_APPLE_CLIENT_ID ||
    import.meta.env.VITE_FACEBOOK_APP_ID
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-extrabold text-stone-900">
            {isSignup ? 'Create your account' : 'Sign in to PetLink'}
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            Book trusted pet care in your neighborhood
          </p>
        </div>

        {/* OAuth Buttons */}
        {hasOAuthProviders && (
          <>
            <OAuthButtons
              onSuccess={handleOAuthSuccess}
              onError={(msg) => setError(msg)}
            />

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-4 text-xs text-stone-400 font-medium uppercase">
                  or sign in with email
                </span>
              </div>
            </div>
          </>
        )}

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            {isSignup && (
              <div>
                <label htmlFor="signup-name" className="sr-only">
                  Full name
                </label>
                <input
                  id="signup-name"
                  name="name"
                  type="text"
                  required
                  className="w-full px-3 py-2.5 border border-stone-300 placeholder-stone-500 text-stone-900 rounded-lg focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                  placeholder="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {signupNameError && name !== '' && (
                  <p className="text-red-500 text-xs mt-1">{signupNameError}</p>
                )}
              </div>
            )}
            <label htmlFor="email-address" className="sr-only">
              Email address
            </label>
            <input
              id="email-address"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full px-3 py-2.5 border border-stone-300 placeholder-stone-500 text-stone-900 rounded-lg focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 text-sm"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                required
                className="w-full px-3 py-2.5 border border-stone-300 placeholder-stone-500 text-stone-900 rounded-lg focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                placeholder={isSignup ? 'Password (min 8 characters)' : 'Password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {signupPasswordError && (
                <p className="text-red-500 text-xs mt-1">{signupPasswordError}</p>
              )}
            </div>
          </div>

          {isSignup && (
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
              />
              I confirm I am 13 years of age or older
            </label>
          )}

          {error && <div className="text-red-500 text-sm text-center">{error}</div>}

          <button
            type="submit"
            disabled={!isFormValid}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm text-stone-600">
          {isSignup ? (
            'Already have an account? '
          ) : import.meta.env.DEV ? (
            <>
              Demo:{' '}
              <span className="font-mono bg-stone-100 px-1 rounded text-xs">
                owner@example.com
              </span>{' '}
              /{' '}
              <span className="font-mono bg-stone-100 px-1 rounded text-xs">password123</span>{' '}
            </>
          ) : (
            "Don't have an account? "
          )}
          <button
            type="button"
            onClick={() => {
              setIsSignup(!isSignup);
              setError('');
            }}
            className="text-emerald-600 hover:text-emerald-500 font-medium"
          >
            {isSignup ? 'Sign in' : 'Create account'}
          </button>
        </p>
      </div>
    </div>
  );
}
