// Renders icon.svg to the PNG sizes the manifest and iOS need. Needs Playwright.
// Usage: node scripts/icons.js
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const svg = fs.readFileSync('icon.svg', 'utf8');
  const b = await chromium.launch();
  for (const size of [180, 192, 512]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
    await p.screenshot({ path: `icon-${size}.png`, omitBackground: true });
  }
  await b.close();
  console.log('icons done');
})();
