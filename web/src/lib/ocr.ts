// On-device OCR with Tesseract (no image ever leaves the phone / computer).
// Engine + English model are bundled in /ocr (see scripts/copy-ocr-assets.mjs).
import type { Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;
let progressCb: ((p: number) => void) | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import('tesseract.js'); // loaded only when first scanning
      const base = new URL('./ocr/', document.baseURI).href;
      return createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: `${base}worker.min.js`,
        corePath: base,
        langPath: base,
        gzip: true,
        workerBlobURL: false,
        logger: m => { if (m.status === 'recognizing text') progressCb?.(m.progress); }
      });
    })().catch(e => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

/** Resize to ~2000px on the long side, greyscale, stretch contrast. Big help for phone photos. */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height)) || 1;
  const up = Math.max(bmp.width, bmp.height) < 1200 ? 1600 / Math.max(bmp.width, bmp.height) : scale; // enlarge small screenshots
  const w = Math.round(bmp.width * up);
  const h = Math.round(bmp.height * up);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    d[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) * 255) / range;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export type ScanKind = 'invoice' | 'payment';

/** Read text from an image. `onProgress` gets 0..1. */
export async function readImage(file: Blob, kind: ScanKind, onProgress?: (p: number) => void): Promise<{ text: string; confidence: number }> {
  progressCb = onProgress ?? null;
  const [worker, canvas] = await Promise.all([getWorker(), prepare(file)]);
  // Invoices are tables: treat as one block so each row stays on one line.
  await worker.setParameters({ tessedit_pageseg_mode: (kind === 'invoice' ? '6' : '3') as any, preserve_interword_spaces: '1' });
  const { data } = await worker.recognize(canvas);
  progressCb = null;
  return { text: data.text, confidence: data.confidence };
}
