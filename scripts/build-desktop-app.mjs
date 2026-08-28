// scripts/build-desktop-app.mjs
import { execSync } from 'child_process';

try {
  console.log('⚡️ Building renderer and main for Electron…');
  // Build the renderer assets (vite)
  execSync('npm run build:electron', { stdio: 'inherit' });

  console.log('📦 Packaging application with electron-builder…');
  // Pack the app using electron-builder (uses the "build" section in package.json)
  execSync('npx electron-builder', { stdio: 'inherit' });

  console.log('✅ Desktop build completed successfully.');
} catch (err) {
  console.error('❌ Build failed:', err.message);
  process.exit(1);
}
