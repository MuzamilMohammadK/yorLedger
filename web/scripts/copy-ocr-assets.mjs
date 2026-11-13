// Copy the Tesseract engine + English model into public/ocr so scanning works
// offline (APK, desktop) and never fetches code from a CDN at runtime.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const out = fileURLToPath(new URL('../public/ocr/', import.meta.url));
mkdirSync(out, { recursive: true });

const tess = dirname(require.resolve('tesseract.js/package.json'));
const core = dirname(require.resolve('tesseract.js-core/package.json'));
const eng = dirname(require.resolve('@tesseract.js-data/eng/package.json'));

const files = [
  [join(tess, 'dist/worker.min.js'), 'worker.min.js'],
  [join(core, 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [join(core, 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [join(eng, '4.0.0_best_int/eng.traineddata.gz'), 'eng.traineddata.gz']
];
for (const [from, to] of files) copyFileSync(from, join(out, to));
console.log(`OCR assets copied to ${out}`);
