import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type Sharp from 'sharp';

/*
 * The Kira logo, transparent, in the middle of every published photo: on kiraimobiliare.ro and on Storia / OLX.ro,
 * which take the photos from /poze/<id> (app/poze/[id]/route.ts). The CRM keeps the original; only this public copy
 * carries the logo. A soft dark halo around the gold logo lets it show on busy, colourful photos too (a garden, trees),
 * while the photo stays clear. The public copy also leaves out the photo's hidden details (EXIF: phone, date, GPS).
 * When the look changes here, change PHOTO_VERSION in lib/public-properties.ts, so Storia takes the photos again.
 */

const LOGO_FILE = path.join(process.cwd(), 'public', 'images', 'kira-logo-gold.png');
const LOGO_OPACITY = 0.35; // 0: not visible, 1: fully
const HALO_OPACITY = 0.3;
const LOGO_HEIGHT = 0.42; // the logo's height, as a part of the photo's shorter side
const MAX_SIDE = 2560; // the public copy's longer side, at most
const PAD = 24; // room around the logo for its halo, in the logo file's pixels

// sharp (the image library) is loaded the first time a photo needs it: if it ever failed to load, the photos would
// still be shown (app/poze/[id]/route.ts), only without the logo, rather than not at all.
let sharpP: Promise<typeof Sharp> | null = null;
function lib(): Promise<typeof Sharp> {
  sharpP ??= import('sharp')
    .then((m) => m.default)
    .catch((e) => {
      sharpP = null;
      throw e;
    });
  return sharpP;
}

/** The image with its transparency multiplied by a (0..1). */
async function fade(img: Buffer, a: number) {
  const sharp = await lib();
  return sharp(img)
    .ensureAlpha()
    .composite([{ input: Buffer.from([255, 255, 255, Math.round(255 * a)]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

type Mark = { png: Buffer; scale: number };
let markP: Promise<Mark> | null = null;

/** The logo with its halo, made once per server instance. scale: its whole height over the logo's own height. */
function mark(): Promise<Mark> {
  markP ??= (async () => {
    const sharp = await lib();
    const padded = await sharp(await readFile(LOGO_FILE))
      .ensureAlpha()
      .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const { width = 0, height = 0 } = await sharp(padded).metadata();
    const shadow = await sharp(padded).extractChannel('alpha').blur(7).png().toBuffer();
    const halo = await sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } }).joinChannel(shadow).png().toBuffer();
    const png = await sharp(await fade(halo, HALO_OPACITY)).composite([{ input: await fade(padded, LOGO_OPACITY) }]).png().toBuffer();
    return { png, scale: height / (height - 2 * PAD) };
  })().catch((e) => {
    markP = null;
    throw e;
  });
  return markP;
}

/**
 * The photo as the public sees it: upright, at most 2560 px on its longer side, on white where it was transparent,
 * with the logo in the middle, as a JPEG. Throws when the photo cannot be read.
 */
export async function withLogo(input: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const sharp = await lib();
  const m = await mark();
  const { data, info } = await sharp(input, { failOn: 'none' })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const h = Math.round(Math.min(width, height) * LOGO_HEIGHT * m.scale);
  const parts: Sharp.OverlayOptions[] = [];
  if (h >= 16) {
    // Never wider or taller than the photo.
    const logo = await sharp(m.png).resize({ width, height: Math.min(h, height), fit: 'inside' }).png().toBuffer();
    parts.push({ input: logo, gravity: 'centre' });
  }
  const out = await sharp(data, { raw: { width, height, channels } }).composite(parts).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  return new Uint8Array(out);
}
