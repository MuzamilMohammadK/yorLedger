import type { CapacitorConfig } from '@capacitor/cli';

// Android APK: the same web build (dist/) inside a native shell.
const config: CapacitorConfig = {
  appId: 'com.yorledger.app',
  appName: 'YorLedger',
  webDir: 'dist',
  android: {
    // Served from https://localhost inside the app (Firebase Auth allows localhost by default).
    allowMixedContent: false
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_yorledger',
      iconColor: '#4338CA'
    }
  }
};

export default config;
