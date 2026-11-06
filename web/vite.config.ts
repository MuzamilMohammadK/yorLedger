import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the same build works on Firebase Hosting, inside the Android APK
// (Capacitor) and inside the desktop app (Electron, loaded from file://).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 }
});
