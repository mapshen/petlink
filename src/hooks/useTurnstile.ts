import { useEffect, useRef, useState, useCallback } from 'react';

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: TurnstileRenderOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  size?: 'normal' | 'compact' | 'invisible';
  theme?: 'light' | 'dark' | 'auto';
}

interface UseTurnstileOptions {
  siteKey: string | undefined;
  action?: string;
}

interface UseTurnstileResult {
  token: string | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  reset: () => void;
  isReady: boolean;
}

let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;

  if (window.turnstile) {
    scriptLoadPromise = Promise.resolve();
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error('Failed to load Turnstile script'));
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export function useTurnstile({ siteKey }: UseTurnstileOptions): UseTurnstileResult {
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;

    let mounted = true;

    loadTurnstileScript()
      .then(() => {
        if (!mounted || !containerRef.current || !window.turnstile) return;

        // Clear container before rendering
        if (widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // Widget may already be removed
          }
        }

        const id = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (newToken: string) => {
            if (mounted) setToken(newToken);
          },
          'error-callback': () => {
            if (mounted) setToken(null);
          },
          'expired-callback': () => {
            if (mounted) setToken(null);
          },
          size: 'invisible',
          theme: 'auto',
        });

        widgetIdRef.current = id;
        if (mounted) setIsReady(true);
      })
      .catch(() => {
        // Script load failed — degrade gracefully
        if (mounted) setIsReady(false);
      });

    return () => {
      mounted = false;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignore cleanup errors
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        // Ignore reset errors
      }
    }
  }, []);

  return { token, containerRef, reset, isReady };
}
