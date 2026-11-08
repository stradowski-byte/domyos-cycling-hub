import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('Starting GitHub Pages build process for Domyos Cycling Hub PWA (Zero Private Data)...');

const configPath = path.resolve('./firebase-applet-config.json');
let originalConfig = null;

if (fs.existsSync(configPath)) {
  originalConfig = fs.readFileSync(configPath, 'utf-8');
}

try {
  // Gatekeep 2: Overwrite firebase-applet-config.json with empty JSON before building
  // so zero API keys, database IDs, or private configs are ever bundled into dist/ or docs/
  fs.writeFileSync(configPath, '{}');
  console.log('Cleared firebase-applet-config.json for public GitHub Pages build.');

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
    console.log('Successfully copied clean public build output from /dist to /docs.');
  }
} catch (error) {
  console.error('Build failed:', error);
  process.exitCode = 1;
} finally {
  if (originalConfig !== null) {
    fs.writeFileSync(configPath, originalConfig);
    console.log('Restored local firebase-applet-config.json after build.');
  }
}
