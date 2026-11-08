import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('Starting GitHub Pages build process for Domyos Cycling Hub PWA...');

const configPath = path.resolve('./firebase-applet-config.json');
let originalConfig = null;

if (fs.existsSync(configPath)) {
  originalConfig = fs.readFileSync(configPath, 'utf-8');
}

try {
  // Run Vite build (predefined Firebase config in src/lib/firebase.ts remains active)
  console.log('Running vite build...');
  execSync('npx vite build', { stdio: 'inherit' });

  const distDir = path.resolve('./dist');
  const docsDir = path.resolve('./docs');

  if (fs.existsSync(distDir)) {
    const indexHtml = path.join(distDir, 'index.html');
    const notFoundHtml = path.join(distDir, '404.html');
    if (fs.existsSync(indexHtml)) {
      fs.copyFileSync(indexHtml, notFoundHtml);
      console.log('Created dist/404.html for SPA routing.');
    }

    fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
    console.log('Created dist/.nojekyll.');

    if (fs.existsSync(docsDir)) {
      fs.rmSync(docsDir, { recursive: true, force: true });
    }
    fs.cpSync(distDir, docsDir, { recursive: true });
    console.log('Successfully copied build output from /dist to /docs.');
  }
} catch (error) {
  console.error('Build failed:', error);
  process.exitCode = 1;
} finally {
  if (originalConfig !== null) {
    fs.writeFileSync(configPath, originalConfig);
  }
}
