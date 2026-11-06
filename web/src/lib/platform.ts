import { Capacitor } from '@capacitor/core';

declare global {
  interface Window {
    /** Exposed by the desktop app's preload script (desktop/preload.cjs). */
    yorledgerDesktop?: { isDesktop: true };
  }
}

export const isAndroidApp = Capacitor.isNativePlatform();
export const isDesktopApp = !!window.yorledgerDesktop?.isDesktop;
export const isWebsite = !isAndroidApp && !isDesktopApp;

/** Google blocks its sign-in popup inside embedded web views, so offer it on the website only. */
export const canUseGoogleSignIn = isWebsite;

/** Open a link (WhatsApp, phone) outside the app. */
export function openExternal(url: string) {
  window.open(url, '_blank', 'noopener');
}

/** Save or share a generated file in the way each platform supports. */
export async function shareFile(blob: Blob, filename: string, title: string): Promise<void> {
  if (isAndroidApp) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const data = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
    const written = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    await Share.share({ title, files: [written.uri] });
    return;
  }
  const file = new File([blob], filename, { type: blob.type });
  if (isWebsite && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title, files: [file] });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // user closed the share sheet
    }
  }
  // Desktop app and desktop browsers: save as a download.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
