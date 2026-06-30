// Redimensionare + compresie a imaginilor ÎN BROWSER, înainte de upload.
// Reduce drastic dimensiunea trimisă la server (de la ~5MB la ~200-400KB),
// astfel încât procesarea sharp pe server încape în limita de timp Vercel.
// Serverul oricum regenerează variante (thumb/medium/large) și watermark.

const MAX_DIMENSION = 1920; // px — suficient pentru variantele server (max 1600)
const JPEG_QUALITY = 0.82;
// Tipuri pe care browserul nu le poate desena pe canvas → le lăsăm neatinse.
const SKIP_TYPES = new Set(['image/gif', 'image/heic', 'image/heif']);

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

    // Deja mică și sub 1MB → nu mai recomprimăm
    if (scale === 1 && file.size < 1_000_000) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob: Blob | null = await new Promise(res =>
      canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file; // nu am câștigat nimic

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
