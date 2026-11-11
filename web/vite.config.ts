import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Test builds (VITE_USE_EMULATORS=true) must reach the local Firebase emulators, which the
// production Content-Security-Policy blocks. Widen connect-src only for those builds.
const emulatorCsp = (): Plugin => ({
  name: 'emulator-csp',
  transformIndexHtml(html) {
    if (process.env.VITE_USE_EMULATORS !== 'true') return html;
    return html
      .replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:9099 http://127.0.0.1:8080 ws://127.0.0.1:8080")
      .replace('frame-src ', 'frame-src http://127.0.0.1:9099 ');
  }
});

// base './' so the same build works on Firebase Hosting, inside the Android APK
// (Capacitor) and inside the desktop app (Electron, loaded from app://).
export default defineConfig({
  base: './',
  plugins: [react(), emulatorCsp()],
  server: { port: 5173 }
});
