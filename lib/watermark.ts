import sharp from 'sharp';

// Agency-logo watermark applied to property photos at upload time.
// The logo is scaled relative to the image width, faded to a fixed opacity, and
// composited in a corner with a small margin. Sizing is relative so it looks the
// same on every variant (medium/large) regardless of the photo's resolution.

export interface WatermarkOpts {
  gravity?: 'southeast' | 'southwest' | 'northeast' | 'northwest' | 'center';
  opacity?: number;   // 0..1   (default 0.6)
  scalePct?: number;  // logo width as % of photo width (default 18)
  marginPct?: number; // gap from the edges as % of photo width (default 3)
}

const DEFAULTS: Required<Omit<WatermarkOpts, 'gravity'>> & { gravity: NonNullable<WatermarkOpts['gravity']> } = {
  gravity: 'southeast',
  opacity: 0.6,
  scalePct: 18,
  marginPct: 3,
};

// Resize the logo to the target width and reduce its alpha to `opacity`.
// dest-in keeps the logo's pixels but multiplies their alpha by the mask's alpha.
async function fadedLogo(logo: Buffer, targetWidth: number, opacity: number): Promise<Buffer> {
  const resized = await sharp(logo)
    .resize({ width: Math.max(40, targetWidth) })
    .ensureAlpha()
    .png()
    .toBuffer();
  const { width = targetWidth, height = targetWidth } = await sharp(resized).metadata();
  const mask = Buffer.from(
    `<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#fff" fill-opacity="${opacity}"/></svg>`
  );
  return sharp(resized).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

/**
 * Composite the agency logo onto an image buffer. The watermark size and margin
 * are derived from the image's actual width, so it scales with the photo.
 * Returns the watermarked image as a raw (decoded) buffer — the caller re-encodes.
 */
export async function applyWatermark(
  image: Buffer,
  logo: Buffer,
  opts: WatermarkOpts = {}
): Promise<Buffer> {
  const o = { ...DEFAULTS, ...opts };
  const meta = await sharp(image).metadata();
  const baseWidth = meta.width ?? 800;

  const logoWidth = Math.round((baseWidth * o.scalePct) / 100);
  const margin = Math.round((baseWidth * o.marginPct) / 100);

  const faded = await fadedLogo(logo, logoWidth, o.opacity);
  // Pad the overlay with transparent margin so gravity placement keeps it off the edges.
  const padded = await sharp(faded)
    .extend({ top: margin, bottom: margin, left: margin, right: margin, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp(image).composite([{ input: padded, gravity: o.gravity }]).toBuffer();
}
