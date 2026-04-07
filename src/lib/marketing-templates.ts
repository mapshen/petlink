import type { CardData } from './qr-business-card';

/**
 * Marketing material template definitions and canvas rendering.
 * Pure data + rendering functions — no React dependencies.
 */

export interface MarketingData {
  readonly name: string;
  readonly avatarUrl: string | undefined;
  readonly tagline: string;
  readonly rating: number | null;
  readonly reviewCount: number;
  readonly serviceLabels: readonly string[];
  readonly profileUrl: string;
}

export interface TemplateDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: 'flyer' | 'social';
  readonly width: number;
  readonly height: number;
  readonly render: (
    ctx: CanvasRenderingContext2D,
    data: MarketingData,
    qrImage: HTMLCanvasElement | null,
  ) => void;
}

/** Build MarketingData from existing CardData + profile URL. */
export function buildMarketingData(
  cardData: CardData,
  profileUrl: string,
): MarketingData {
  return {
    name: cardData.name,
    avatarUrl: cardData.avatarUrl,
    tagline: cardData.tagline,
    rating: cardData.rating,
    reviewCount: cardData.reviewCount,
    serviceLabels: cardData.serviceLabels,
    profileUrl,
  };
}

/** Generate a safe download filename from template ID and sitter name. */
export function generateFileName(templateId: string, name: string): string {
  const safeName = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);
  return `petlink-${templateId}-${safeName || 'sitter'}.png`;
}

/** Find a template by its ID. */
export function getTemplateById(id: string): TemplateDefinition | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

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

function drawStarIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  const spikes = 5;
  const outerRadius = size;
  const innerRadius = size * 0.45;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (Math.PI / 2) * -1 + (Math.PI / spikes) * i;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number = 2,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines) break;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }
  return lines;
}

function drawRating(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rating: number,
  reviewCount: number,
  starColor: string,
  textColor: string,
): void {
  ctx.fillStyle = starColor;
  drawStarIcon(ctx, x + 7, y - 4, 7);
  ctx.fillStyle = starColor;
  ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
  ctx.fillText(rating.toFixed(1), x + 18, y);
  ctx.fillStyle = textColor;
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  ctx.fillText(`(${reviewCount} reviews)`, x + 50, y);
}

function drawServicePills(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  labels: readonly string[],
  bgColor: string,
  textColor: string,
): void {
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  let currentX = x;
  const pillHeight = 20;
  const pillPadding = 8;
  const pillGap = 6;

  for (const label of labels.slice(0, 4)) {
    const textWidth = ctx.measureText(label).width;
    const pillWidth = textWidth + pillPadding * 2;

    ctx.fillStyle = bgColor;
    roundRect(ctx, currentX, y, pillWidth, pillHeight, 10);
    ctx.fill();

    ctx.fillStyle = textColor;
    ctx.fillText(label, currentX + pillPadding, y + 14);

    currentX += pillWidth + pillGap;
  }
}

// ---------------------------------------------------------------------------
// Template renderers
// ---------------------------------------------------------------------------

function renderProfessionalFlyer(
  ctx: CanvasRenderingContext2D,
  data: MarketingData,
  qrImage: HTMLCanvasElement | null,
): void {
  const W = 612;
  const H = 792;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Top emerald banner
  ctx.fillStyle = '#059669';
  ctx.fillRect(0, 0, W, 180);

  // Banner text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Professional Pet Care', W / 2, 70);
  ctx.font = '18px system-ui, -apple-system, sans-serif';
  ctx.fillText('You Can Trust', W / 2, 100);

  // PetLink branding in banner
  ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.textAlign = 'right';
  ctx.fillText('PetLink', W - 24, 24);
  ctx.textAlign = 'center';

  // Sitter name
  ctx.fillStyle = '#1c1917';
  ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.name, W / 2, 240);

  // Tagline
  if (data.tagline) {
    ctx.fillStyle = '#78716c';
    ctx.font = '16px system-ui, -apple-system, sans-serif';
    const lines = wrapText(ctx, data.tagline, W - 80, 2);
    lines.forEach((line, i) => {
      ctx.fillText(line, W / 2, 275 + i * 24);
    });
  }

  // Rating
  if (data.rating !== null) {
    ctx.textAlign = 'left';
    const ratingX = W / 2 - 60;
    drawRating(ctx, ratingX, 340, data.rating, data.reviewCount, '#d97706', '#78716c');
    ctx.textAlign = 'center';
  }

  // Service pills (centered)
  if (data.serviceLabels.length > 0) {
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    const pillPadding = 8;
    const pillGap = 6;
    const displayed = data.serviceLabels.slice(0, 4);
    const totalWidth = displayed.reduce((sum, label) => {
      return sum + ctx.measureText(label).width + pillPadding * 2 + pillGap;
    }, -pillGap);
    const startX = (W - totalWidth) / 2;
    drawServicePills(ctx, startX, 370, data.serviceLabels, '#ecfdf5', '#059669');
  }

  // Divider
  ctx.strokeStyle = '#e7e5e4';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 420);
  ctx.lineTo(W - 60, 420);
  ctx.stroke();

  // Why choose section
  ctx.fillStyle = '#1c1917';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.fillText('Why Choose PetLink?', W / 2, 460);

  const benefits = [
    'Verified and background-checked sitters',
    'Secure payments with booking protection',
    'Real-time updates and GPS walk tracking',
    'Flexible scheduling and instant booking',
  ];

  ctx.textAlign = 'left';
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#57534e';
  benefits.forEach((benefit, i) => {
    const y = 500 + i * 30;
    ctx.fillStyle = '#059669';
    ctx.fillText('\u2713', 80, y);
    ctx.fillStyle = '#57534e';
    ctx.fillText(benefit, 105, y);
  });

  // QR code section
  if (qrImage) {
    const qrSize = 120;
    const qrX = (W - qrSize) / 2;
    const qrY = 630;
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#a8a29e';
    ctx.font = '13px system-ui, -apple-system, sans-serif';
    ctx.fillText('Scan to view profile and book', W / 2, qrY + qrSize + 24);
  }

  ctx.textAlign = 'start';
}

function renderSocialCard(
  ctx: CanvasRenderingContext2D,
  data: MarketingData,
  qrImage: HTMLCanvasElement | null,
): void {
  const W = 1080;
  const H = 1080;

  // Gradient background
  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, '#ecfdf5');
  gradient.addColorStop(1, '#d1fae5');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  // White card area
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 60, 60, W - 120, H - 120, 32);
  ctx.fill();

  // Subtle shadow effect via border
  ctx.strokeStyle = '#e7e5e4';
  ctx.lineWidth = 1;
  roundRect(ctx, 60, 60, W - 120, H - 120, 32);
  ctx.stroke();

  // Top accent bar
  ctx.fillStyle = '#059669';
  roundRect(ctx, 60, 60, W - 120, 8, 0);
  ctx.fill();

  // PetLink branding top-right
  ctx.fillStyle = '#059669';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('PetLink', W - 100, 120);
  ctx.textAlign = 'center';

  // Name
  ctx.fillStyle = '#1c1917';
  ctx.font = 'bold 56px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.name, W / 2, 260);

  // Tagline
  if (data.tagline) {
    ctx.fillStyle = '#78716c';
    ctx.font = '24px system-ui, -apple-system, sans-serif';
    const lines = wrapText(ctx, data.tagline, W - 200, 2);
    lines.forEach((line, i) => {
      ctx.fillText(line, W / 2, 320 + i * 36);
    });
  }

  // Rating
  if (data.rating !== null) {
    // Large rating number
    ctx.fillStyle = '#d97706';
    ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(data.rating.toFixed(1), W / 2, 450);

    // Star icons row
    const starY = 475;
    const starSize = 14;
    const starGap = 32;
    const starsStartX = W / 2 - (starGap * 2);
    for (let i = 0; i < 5; i++) {
      const filled = i < Math.round(data.rating);
      ctx.fillStyle = filled ? '#d97706' : '#d6d3d1';
      drawStarIcon(ctx, starsStartX + i * starGap, starY, starSize);
    }

    ctx.fillStyle = '#a8a29e';
    ctx.font = '18px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${data.reviewCount} reviews`, W / 2, 510);
  }

  // Service pills
  if (data.serviceLabels.length > 0) {
    ctx.font = '20px system-ui, -apple-system, sans-serif';
    const pillPadding = 16;
    const pillGap = 10;
    const pillHeight = 38;
    const displayed = data.serviceLabels.slice(0, 4);
    const totalWidth = displayed.reduce((sum, label) => {
      return sum + ctx.measureText(label).width + pillPadding * 2 + pillGap;
    }, -pillGap);
    let currentX = (W - totalWidth) / 2;

    for (const label of displayed) {
      const textWidth = ctx.measureText(label).width;
      const pillWidth = textWidth + pillPadding * 2;

      ctx.fillStyle = '#ecfdf5';
      roundRect(ctx, currentX, 560, pillWidth, pillHeight, 19);
      ctx.fill();

      ctx.fillStyle = '#059669';
      ctx.textAlign = 'left';
      ctx.fillText(label, currentX + pillPadding, 560 + 26);
      ctx.textAlign = 'center';

      currentX += pillWidth + pillGap;
    }
  }

  // QR code
  if (qrImage) {
    const qrSize = 200;
    ctx.drawImage(qrImage, (W - qrSize) / 2, 660, qrSize, qrSize);

    ctx.fillStyle = '#a8a29e';
    ctx.font = '18px system-ui, -apple-system, sans-serif';
    ctx.fillText('Scan to book', W / 2, 660 + qrSize + 32);
  }

  ctx.textAlign = 'start';
}

function renderNeighborhoodFlyer(
  ctx: CanvasRenderingContext2D,
  data: MarketingData,
  qrImage: HTMLCanvasElement | null,
): void {
  const W = 612;
  const H = 792;

  // Background
  ctx.fillStyle = '#fafaf9';
  ctx.fillRect(0, 0, W, H);

  // Decorative top border
  ctx.fillStyle = '#059669';
  ctx.fillRect(0, 0, W, 6);

  // Header area
  ctx.fillStyle = '#1c1917';
  ctx.textAlign = 'center';
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.fillText('Pet Sitter in Your Neighborhood', W / 2, 50);

  // PetLink branding
  ctx.fillStyle = '#059669';
  ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('PetLink', W - 20, 22);
  ctx.textAlign = 'center';

  // Main card with info
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 40, 75, W - 80, 320, 16);
  ctx.fill();
  ctx.strokeStyle = '#e7e5e4';
  ctx.lineWidth = 1;
  roundRect(ctx, 40, 75, W - 80, 320, 16);
  ctx.stroke();

  // Sitter name in card
  ctx.fillStyle = '#1c1917';
  ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.name, W / 2, 130);

  // Tagline
  if (data.tagline) {
    ctx.fillStyle = '#78716c';
    ctx.font = '15px system-ui, -apple-system, sans-serif';
    const lines = wrapText(ctx, data.tagline, W - 120, 2);
    lines.forEach((line, i) => {
      ctx.fillText(line, W / 2, 165 + i * 22);
    });
  }

  // Rating
  if (data.rating !== null) {
    ctx.textAlign = 'left';
    drawRating(ctx, W / 2 - 55, 230, data.rating, data.reviewCount, '#d97706', '#78716c');
    ctx.textAlign = 'center';
  }

  // Services
  if (data.serviceLabels.length > 0) {
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#059669';
    const servicesText = data.serviceLabels.slice(0, 4).join('  \u2022  ');
    ctx.fillText(servicesText, W / 2, 275);
  }

  // QR code inside card
  if (qrImage) {
    const qrSize = 90;
    ctx.drawImage(qrImage, (W - qrSize) / 2, 295, qrSize, qrSize);
  }

  // Tear-off tabs section
  ctx.fillStyle = '#e7e5e4';
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#a8a29e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, 430);
  ctx.lineTo(W - 20, 430);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#a8a29e';
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.fillText('Cut along the dotted line. Tear off a tab to share!', W / 2, 455);

  // Tear-off tabs
  const tabCount = 7;
  const tabWidth = (W - 40) / tabCount;
  const tabTop = 475;
  const tabHeight = H - tabTop - 20;

  for (let i = 0; i < tabCount; i++) {
    const tabX = 20 + i * tabWidth;

    // Tab border
    ctx.strokeStyle = '#d6d3d1';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2]);
    ctx.strokeRect(tabX, tabTop, tabWidth, tabHeight);
    ctx.setLineDash([]);

    // Save context for rotation
    ctx.save();

    // Rotate for vertical text
    ctx.translate(tabX + tabWidth / 2, tabTop + tabHeight / 2);
    ctx.rotate(-Math.PI / 2);

    ctx.fillStyle = '#059669';
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(data.name, 0, -8);

    ctx.fillStyle = '#78716c';
    ctx.font = '10px system-ui, -apple-system, sans-serif';
    ctx.fillText('PetLink.com', 0, 8);

    ctx.restore();
  }

  ctx.textAlign = 'start';
}

// ---------------------------------------------------------------------------
// Template catalog
// ---------------------------------------------------------------------------

export const TEMPLATES: readonly TemplateDefinition[] = [
  {
    id: 'professional-flyer',
    name: 'Professional Flyer',
    description: 'Clean, formal flyer for vet offices and community boards. Letter size (8.5 x 11).',
    category: 'flyer',
    width: 612,
    height: 792,
    render: renderProfessionalFlyer,
  },
  {
    id: 'social-card',
    name: 'Social Media Card',
    description: 'Square format for Instagram, Facebook, and RedBook sharing.',
    category: 'social',
    width: 1080,
    height: 1080,
    render: renderSocialCard,
  },
  {
    id: 'neighborhood-flyer',
    name: 'Neighborhood Flyer',
    description: 'Tear-off tab flyer for dog parks and local bulletin boards.',
    category: 'flyer',
    width: 612,
    height: 792,
    render: renderNeighborhoodFlyer,
  },
];
