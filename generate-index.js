/**
 * generate-index.js
 * Runs after `npm run build` to create a Capacitor-compatible index.html
 * inside .output/public by scanning the built assets directory.
 */
import fs from 'fs';
import path from 'path';

const outputPublic = '.output/public';
const assetsDir = path.join(outputPublic, 'assets');

if (!fs.existsSync(assetsDir)) {
  console.error('[generate-index] ERROR: .output/public/assets not found. Did the build run first?');
  process.exit(1);
}

const assets = fs.readdirSync(assetsDir);

const cssFile = assets.find(f => f.startsWith('styles-') && f.endsWith('.css'));
const jsFile  = assets.find(f => f.startsWith('index-')  && f.endsWith('.js'));

if (!cssFile || !jsFile) {
  console.error('[generate-index] ERROR: Could not find styles or index JS in assets:', assets);
  process.exit(1);
}

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no" />
    <meta name="theme-color" content="#0a1224" />
    <title>System — Solo Leveling Reader</title>
    <link rel="stylesheet" href="/assets/${cssFile}">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/${jsFile}"></script>
  </body>
</html>`;

fs.writeFileSync(path.join(outputPublic, 'index.html'), html);
console.log(`[generate-index] Generated index.html → css: ${cssFile}, js: ${jsFile}`);
