import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shadowhunter.codex',
  appName: 'Shadow Hunter Codex',
  webDir: '.output/public',
  plugins: {
    SplashScreen: {
      launchShowDuration: 100,
      launchAutoHide: true,
      launchFadeOutDuration: 100,
      backgroundColor: "#000000",
      showSpinner: false,
    },
  },
};

export default config;
