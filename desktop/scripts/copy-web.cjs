// Copy the built website (web/dist) into the desktop app bundle.
const fs = require('node:fs');
const path = require('node:path');
const src = path.join(__dirname, '..', '..', 'web', 'dist');
const dst = path.join(__dirname, '..', 'app');
if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error('web/dist not found. Run `npm run build` at the repo root first.');
  process.exit(1);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log(`Copied ${src} -> ${dst}`);
