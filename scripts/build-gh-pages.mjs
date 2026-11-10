import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const configPath = path.resolve('./firebase-applet-config.json');
const publicAssetsDir = path.resolve('./public/assets');
const docsDir = path.resolve('./docs');

try {
  // Gatekeep 1: Ensure firebase-applet-config.json is strictly empty {}
  fs.writeFileSync(configPath, '{}\n');

  // Gatekeep 2: Remove any accidental chat attachments in /public/assets or legacy /docs
  if (fs.existsSync(publicAssetsDir)) {
    fs.rmSync(publicAssetsDir, { recursive: true, force: true });
  }
  if (fs.existsSync(docsDir)) {
    fs.rmSync(docsDir, { recursive: true, force: true });
  }

  execSync('npx vite build', { stdio: 'inherit' });

  const distDir = path.resolve('./dist');
  if (fs.existsSync(distDir)) {
    const indexHtml = path.join(distDir, 'index.html');
    const notFoundHtml = path.join(distDir, '404.html');
    if (fs.existsSync(indexHtml)) {
      fs.copyFileSync(indexHtml, notFoundHtml);
    }
    fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
  }
} catch {
  process.exitCode = 1;
} finally {
  // Always keep firebase-applet-config.json empty {} in the repository
  fs.writeFileSync(configPath, '{}\n');
}
