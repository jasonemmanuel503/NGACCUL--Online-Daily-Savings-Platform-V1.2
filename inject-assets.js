import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(path.join(dir, f));
    }
  });
}

const files = [];
walkDir(distDir, (filePath) => {
  const relativePath = path.relative(distDir, filePath);
  // Normalize Windows backslashes to forward slashes for URLs
  const urlPath = '/' + relativePath.replace(/\\/g, '/');
  
  // Exclude non-client or cache-unfriendly files
  if (
    urlPath !== '/sw.js' &&
    !urlPath.endsWith('.map') &&
    urlPath !== '/server.cjs' &&
    urlPath !== '/server.cjs.map' &&
    !urlPath.includes('/server') &&
    !relativePath.startsWith('server')
  ) {
    files.push(urlPath);
  }
});

// Always ensure the SPA root is in the list
if (!files.includes('/')) {
  files.push('/');
}

console.log('[Inject Assets] Detected assets to cache:', files);

const swPath = path.join(distDir, 'sw.js');
if (fs.existsSync(swPath)) {
  let swContent = fs.readFileSync(swPath, 'utf8');
  
  // 1. Find and replace the CACHE_NAME definition with a dynamic build version
  const cacheNameRegex = /const\s+CACHE_NAME\s*=\s*'[^']*';/g;
  const buildVersion = `ngaccul-pwa-build-${Date.now()}`;
  const cacheNameReplacement = `const CACHE_NAME = '${buildVersion}';`;
  
  if (cacheNameRegex.test(swContent)) {
    swContent = swContent.replace(cacheNameRegex, cacheNameReplacement);
    console.log(`[Inject Assets] Dynamic cache name set to: ${buildVersion}`);
  } else {
    console.warn('[Inject Assets] Warning: Could not find CACHE_NAME variable in dist/sw.js');
  }

  // 2. Find and replace the ASSETS_TO_CACHE definition
  const assetsRegex = /const\s+ASSETS_TO_CACHE\s*=\s*\[[^\]]*\];/g;
  const assetsReplacement = `const ASSETS_TO_CACHE = ${JSON.stringify(files, null, 2)};`;
  
  if (assetsRegex.test(swContent)) {
    swContent = swContent.replace(assetsRegex, assetsReplacement);
    fs.writeFileSync(swPath, swContent, 'utf8');
    console.log('[Inject Assets] Successfully injected assets into dist/sw.js!');
  } else {
    console.error('[Inject Assets] Error: Could not find ASSETS_TO_CACHE variable in dist/sw.js');
  }
} else {
  console.error('[Inject Assets] Error: dist/sw.js not found!');
}
