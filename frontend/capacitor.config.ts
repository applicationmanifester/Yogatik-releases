import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.yogatik.mobile',
  appName: 'Yogatik',
  webDir: 'dist',
  // Allow the WebView to reach Firebase, Google OAuth, and CDNs
  server: {
    androidScheme: 'https',
    allowNavigation: [
      '*.google.com',
      '*.googleapis.com',
      '*.gstatic.com',
      '*.firebase.com',
      '*.firebaseapp.com',
      '*.firebaseio.com',
      'yogatik.web.app',
      '*.yogatik.app',
    ],
  },
  android: {
    // Use the same dark background as the web app
    backgroundColor: '#0a0a0a',
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0a0a0a',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#0a0a0a',
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
