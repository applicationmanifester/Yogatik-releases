import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.yogatik.mobile',
  appName: 'Yogatik',
  webDir: 'dist',
  // Allow the WebView to reach Firebase, Google OAuth, and CDNs
  server: {
    androidScheme: 'https',
    allowNavigation: [
      // Google OAuth sign-in (signInWithRedirect navigates here)
      '*.google.com',
      'accounts.google.com',
      '*.googleapis.com',
      '*.gstatic.com',
      // Firebase Auth handler (processes the OAuth callback)
      '*.firebase.com',
      '*.firebaseapp.com',
      'yogatik.firebaseapp.com',
      '*.firebaseio.com',
      // App domains
      'yogatik.web.app',
      '*.yogatik.app',
    ],
  },
  android: {
    // Use the same dark background as the web app
    backgroundColor: '#0a0a0a',
    // Standard Mobile Chrome User-Agent without WebView markers to enable Google OAuth
    overrideUserAgent: 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
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
