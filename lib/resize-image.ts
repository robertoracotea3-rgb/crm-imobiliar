// Redimensionare + compresie a imaginilor ÎN BROWSER, înainte de upload.
// Reduce drastic dimensiunea trimisă la server (de la ~5MB la ~200-400KB),
// astfel încât procesarea sharp pe server încape în limita de timp Vercel.
// Serverul oricum regenerează variante (thumb/medium/large) și watermark.

const MAX_DIMENSION = 1920; // px — suficient pentru variantele server (max 1600)
const JPEG_QUALITY = 0.82;
// GIF-urile pot fi animate, iar canvas-ul ar păstra doar primul cadru → le lăsăm
// neatinse (serverul oricum refuză imaginile animate).
//
// HEIC/HEIF NU mai sunt sărite: Safari și iOS le pot desena nativ pe canvas, deci
// acolo se convertesc în JPEG și scad de la ~3 MB la ~300 KB. Pe browserele care
// nu le pot decoda, loadImage() eșuează și fail-safe-ul de mai jos întoarce
// fișierul original — exact comportamentul dinainte, fără regresie.
const SKIP_TYPES = new Set(['image/gif']);

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load fail')); };
    img.src = url;
  });
}

/**
 * Redimensionează o imagine la max MAX_DIMENSION px (latura mare) și o
 * recomprimă JPEG. Întoarce un File nou. Dacă ceva eșuează sau tipul nu e
 * suportat de canvas, întoarce fișierul original (fail-safe).
 */
export async function resizeImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || SKIP_TYPES.has(file.type)) return file;

  try {
    const img = await loadImage(file);
    const { width, height } = img;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));

    // Deja mică și sub 1MB → nu mai recomprimăm. HEIC/HEIF fac excepție: chiar
    // și mici, serverul le procesează mai lent, iar JPEG-ul e universal.
    const alreadySmall = scale === 1 && file.size < 1_000_000;
    if (alreadySmall && !/^image\/hei[cf]$/.test(file.type)) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob: Blob | null = await new Promise(res =>
      canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY)
    );
    // Pentru HEIC păstrăm rezultatul chiar dacă nu e mai mic: serverul primește
    // un JPEG pe care îl poate procesa oriunde.
    const isHeic = /^image\/hei[cf]$/.test(file.type);
    if (!blob || (blob.size >= file.size && !isHeic)) return file; // nu am câștigat nimic

    const newName = file.name.replace(/\.(png|webp|heic|heif|bmp|tiff?)$/i, '.jpg');
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file; // fail-safe: trimitem originalul
  }
}

/** Redimensionează un lot de fișiere în paralel. */
export async function resizeAll(files: File[]): Promise<File[]> {
  return Promise.all(files.map(resizeImage));
}
