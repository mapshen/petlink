import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Download, FileImage, Palette, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import {
  TEMPLATES,
  buildMarketingData,
  generateFileName,
  type TemplateDefinition,
} from '../../lib/marketing-templates';
import type { CardData } from '../../lib/qr-business-card';

interface Props {
  readonly cardData: CardData;
  readonly profileUrl: string;
}

const CATEGORY_ICONS: Record<string, typeof FileImage> = {
  flyer: FileImage,
  social: Palette,
};

const CANVAS_RENDER_SCALE = 2;

/**
 * Marketing materials template selector with preview and download.
 * Renders canvas-based flyers and social cards from sitter profile data.
 */
export default function MarketingMaterials({ cardData, profileUrl }: Props) {
  const [selectedId, setSelectedId] = useState(TEMPLATES[0].id);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => TEMPLATES.find((t) => t.id === selectedId) ?? TEMPLATES[0],
    [selectedId],
  );

  const marketingData = useMemo(
    () => {
      const refSource = selected.category === 'social' ? 'social' : 'flyer';
      const url = profileUrl.replace(/ref=[^&]+/, `ref=${refSource}`);
      return buildMarketingData(cardData, url);
    },
    [cardData, profileUrl, selected.category],
  );

  const renderPreview = useCallback(
    (template: TemplateDefinition) => {
      const canvas = previewCanvasRef.current;
      if (!canvas) return;

      canvas.width = template.width * CANVAS_RENDER_SCALE;
      canvas.height = template.height * CANVAS_RENDER_SCALE;
      canvas.style.width = '100%';
      canvas.style.height = 'auto';

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(CANVAS_RENDER_SCALE, CANVAS_RENDER_SCALE);

      const qrCanvas = qrRef.current?.querySelector('canvas') ?? null;
      template.render(ctx, marketingData, qrCanvas);
    },
    [marketingData],
  );

  // Re-render preview when template or data changes
  useEffect(() => {
    // Schedule render after paint so QR canvas is available
    const id = requestAnimationFrame(() => renderPreview(selected));
    return () => cancelAnimationFrame(id);
  }, [selected, renderPreview]);

  const handleSelectTemplate = useCallback(
    (template: TemplateDefinition) => {
      setSelectedId(template.id);
      setDownloadError(null);
      setDownloadSuccess(false);
    },
    [],
  );

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    setDownloadError(null);
    setDownloadSuccess(false);

    try {
      const canvas = document.createElement('canvas');
      const scale = 3; // High-res for print
      canvas.width = selected.width * scale;
      canvas.height = selected.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');

      ctx.scale(scale, scale);

      const qrCanvas = qrRef.current?.querySelector('canvas') ?? null;
      selected.render(ctx, marketingData, qrCanvas);

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = generateFileName(selected.id, cardData.name);
      link.href = dataUrl;
      link.click();
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch {
      setDownloadError('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  }, [selected, marketingData, cardData.name]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <FileImage className="w-5 h-5 text-emerald-600" />
        <h3 className="text-sm font-bold text-stone-900">Marketing Materials</h3>
      </div>

      <p className="text-xs text-stone-500">
        Download ready-made flyers and social cards personalized with your profile.
        Print for dog parks and vet offices, or share on Instagram and RedBook.
      </p>

      {/* Template selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TEMPLATES.map((template) => {
          const Icon = CATEGORY_ICONS[template.category] ?? FileImage;
          const isSelected = template.id === selectedId;
          return (
            <button
              key={template.id}
              onClick={() => handleSelectTemplate(template)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-stone-200 bg-white hover:border-stone-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className={`w-4 h-4 ${isSelected ? 'text-emerald-600' : 'text-stone-400'}`} />
                <span className={`text-sm font-semibold ${isSelected ? 'text-emerald-800' : 'text-stone-700'}`}>
                  {template.name}
                </span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                {template.description}
              </p>
              <span className={`inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                template.category === 'social'
                  ? 'bg-violet-50 text-violet-600'
                  : 'bg-amber-50 text-amber-600'
              }`}>
                {template.category === 'social' ? 'Social Media' : 'Print'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Preview */}
      <div className="border border-stone-200 rounded-xl overflow-hidden bg-stone-50 p-4">
        <div className="text-xs font-medium text-stone-500 mb-3">
          Preview: {selected.name}
        </div>
        <div className="bg-white rounded-lg shadow-sm overflow-hidden" style={{ maxWidth: 400 }}>
          <canvas
            ref={previewCanvasRef}
            className="block w-full h-auto"
          />
        </div>
      </div>

      {/* Hidden QR code for canvas rendering */}
      <div ref={qrRef} className="hidden" aria-hidden="true">
        <QRCodeCanvas
          value={marketingData.profileUrl}
          size={200}
          level="M"
          marginSize={1}
          fgColor="#1c1917"
          bgColor="#ffffff"
        />
      </div>

      {/* Download actions */}
      {downloadError && (
        <p className="text-xs text-red-600">{downloadError}</p>
      )}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleDownload}
          disabled={downloading}
          className="gap-1.5"
        >
          {downloadSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Downloaded
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              {downloading ? 'Generating...' : `Download ${selected.name}`}
            </>
          )}
        </Button>
        <span className="text-xs text-stone-400">
          High-resolution PNG
        </span>
      </div>
    </div>
  );
}
