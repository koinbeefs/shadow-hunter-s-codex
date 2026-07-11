import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shadowhunter.codex',
  appName: 'Shadow Hunter Codex',
  webDir: '.output/public',
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      launchFadeOutDuration: 250,
      backgroundColor: "#000000",
      showSpinner: false,
    },
  },
};

export default config;
