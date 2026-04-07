import React from 'react';

interface TurnstileWidgetProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Invisible Turnstile CAPTCHA widget container.
 * The actual widget is rendered by the useTurnstile hook via Cloudflare's script.
 * This component just provides the mount point.
 */
export default function TurnstileWidget({ containerRef }: TurnstileWidgetProps) {
  return <div ref={containerRef} data-testid="turnstile-container" />;
}
