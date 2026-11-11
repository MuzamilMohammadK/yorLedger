// Compress a photo on the device before storing it (Firestore documents are capped at 1 MiB).

export const MAX_DOC_INPUT_BYTES = 15 * 1024 * 1024;   // reject anything bigger than a normal phone photo
const TARGET_DATA_URL_CHARS = 650_000;                   // ~480 KB of JPEG once base64 encoded

export function isJpeg(file: File): boolean {
  return file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
}

/** Resize (long side ≤ 1800 px) and lower JPEG quality until it fits. */
export async function compressJpeg(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file);
  let maxSide = 1800;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.75, 0.65, 0.55]) {
      const url = c.toDataURL('image/jpeg', q);
      if (url.length <= TARGET_DATA_URL_CHARS) return url;
    }
    maxSide = Math.round(maxSide * 0.75);
  }
  throw new Error('This photo is too large even after compressing. Please take a smaller photo.');
}
