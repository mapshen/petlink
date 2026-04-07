import { useRef, useState, useCallback } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Download, Copy, Check, Star, QrCode } from 'lucide-react';
import { Button } from '../ui/button';
import type { CardData } from '../../lib/qr-business-card';

interface Props {
  readonly cardData: CardData;
  readonly profileUrl: string;
}

const CARD_WIDTH = 420;
const CARD_HEIGHT = 240;

/**
 * Renders a downloadable QR code business card for sitter promotion.
 * Standard business card aspect ratio (3.5:2).
 */
export default function QRBusinessCard({ cardData, profileUrl }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = profileUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [profileUrl]);

  const handleDownload = useCallback(async () => {
    const card = cardRef.current;
    if (!card) return;

    setDownloading(true);
    setDownloadError(null);
    try {
      // Use canvas to render the card as PNG
      const canvas = document.createElement('canvas');
      const scale = 3; // High-res for print
      canvas.width = CARD_WIDTH * scale;
      canvas.height = CARD_HEIGHT * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(scale, scale);

      // Background
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, 12);
      ctx.fill();

      // Left accent bar
      ctx.fillStyle = '#059669'; // emerald-600
      roundRect(ctx, 0, 0, 6, CARD_HEIGHT, 3);
      ctx.fill();

      // Name
      ctx.fillStyle = '#1c1917'; // stone-900
      ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
      ctx.fillText(cardData.name, 24, 40);

      // Tagline
      let taglineLineCount = 0;
      if (cardData.tagline) {
        ctx.fillStyle = '#78716c'; // stone-500
        ctx.font = '13px system-ui, -apple-system, sans-serif';
        const taglineLines = wrapText(ctx, cardData.tagline, 210);
        taglineLineCount = taglineLines.length;
        taglineLines.forEach((line, i) => {
          ctx.fillText(line, 24, 62 + i * 18);
        });
      }

      // Rating
      const ratingY = 62 + taglineLineCount * 18 + (taglineLineCount > 0 ? 10 : 0);
      if (cardData.rating !== null) {
        ctx.fillStyle = '#d97706'; // amber-600
        ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
        ctx.fillText(`${cardData.rating.toFixed(1)}`, 24, ratingY);
        ctx.fillStyle = '#78716c';
        ctx.font = '12px system-ui, -apple-system, sans-serif';
        ctx.fillText(`(${cardData.reviewCount} reviews)`, 58, ratingY);
      }

      // Services
      const servicesY = ratingY + 24;
      if (cardData.serviceLabels.length > 0) {
        ctx.fillStyle = '#059669';
        ctx.font = '11px system-ui, -apple-system, sans-serif';
        const servicesText = cardData.serviceLabels.slice(0, 3).join(' | ') +
          (cardData.serviceLabels.length > 3 ? ` +${cardData.serviceLabels.length - 3}` : '');
        ctx.fillText(servicesText, 24, servicesY);
      }

      // "Scan to book" CTA
      ctx.fillStyle = '#a8a29e'; // stone-400
      ctx.font = '11px system-ui, -apple-system, sans-serif';
      ctx.fillText('Scan to book on PetLink', 24, CARD_HEIGHT - 20);

      // QR code -- grab from the rendered canvas in the DOM
      const qrCanvas = card.querySelector('canvas');
      if (qrCanvas) {
        const qrSize = 140;
        const qrX = CARD_WIDTH - qrSize - 24;
        const qrY = (CARD_HEIGHT - qrSize) / 2;
        ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
      }

      // PetLink branding
      ctx.fillStyle = '#059669';
      ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
      ctx.fillText('PetLink', CARD_WIDTH - 60, CARD_HEIGHT - 16);

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const safeName = cardData.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 50);
      link.download = `petlink-card-${safeName || 'sitter'}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      setDownloadError('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  }, [cardData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <QrCode className="w-5 h-5 text-emerald-600" />
        <h3 className="text-sm font-bold text-stone-900">QR Business Card</h3>
      </div>

      <p className="text-xs text-stone-500">
        Download and print your business card to share at dog parks, vet offices, and pet events.
      </p>

      {/* Card Preview */}
      <div
        ref={cardRef}
        className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden"
        style={{ maxWidth: CARD_WIDTH }}
      >
        <div className="flex">
          {/* Left accent */}
          <div className="w-1.5 bg-emerald-600 flex-shrink-0" />

          {/* Content */}
          <div className="flex-1 p-5 flex">
            {/* Left side -- sitter info */}
            <div className="flex-1 min-w-0 pr-4">
              <h4 className="text-lg font-bold text-stone-900 truncate">
                {cardData.name}
              </h4>
              {cardData.tagline && (
                <p className="text-xs text-stone-500 mt-1 line-clamp-2 leading-relaxed">
                  {cardData.tagline}
                </p>
              )}

              {/* Rating */}
              {cardData.rating !== null && (
                <div className="flex items-center gap-1 mt-2">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span className="text-xs font-bold text-amber-700">
                    {cardData.rating.toFixed(1)}
                  </span>
                  <span className="text-xs text-stone-400">
                    ({cardData.reviewCount})
                  </span>
                </div>
              )}

              {/* Services */}
              {cardData.serviceLabels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {cardData.serviceLabels.slice(0, 3).map((label) => (
                    <span
                      key={label}
                      className="text-[10px] font-medium bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded"
                    >
                      {label}
                    </span>
                  ))}
                  {cardData.serviceLabels.length > 3 && (
                    <span className="text-[10px] text-stone-400">
                      +{cardData.serviceLabels.length - 3} more
                    </span>
                  )}
                </div>
              )}

              <p className="text-[10px] text-stone-400 mt-3">
                Scan to book on PetLink
              </p>
            </div>

            {/* Right side -- QR code */}
            <div className="flex-shrink-0 flex flex-col items-center justify-center">
              <QRCodeCanvas
                value={profileUrl}
                size={120}
                level="M"
                marginSize={1}
                fgColor="#1c1917"
                bgColor="#ffffff"
              />
              <span className="text-[9px] font-bold text-emerald-600 mt-1">
                PetLink
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      {downloadError && <p className="text-xs text-red-600">{downloadError}</p>}
      <div className="flex gap-2">
        <Button
          onClick={handleDownload}
          disabled={downloading}
          size="sm"
          className="gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          {downloading ? 'Downloading...' : 'Download PNG'}
        </Button>
        <Button
          onClick={handleCopyLink}
          variant="outline"
          size="sm"
          className="gap-1.5"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy Profile Link
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/** Draw a rounded rectangle path on canvas */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Word-wrap text to fit within maxWidth, returning an array of lines */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.slice(0, 2); // Max 2 lines
}
