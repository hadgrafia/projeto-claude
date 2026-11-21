const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [, , svgPath, out, size, fundo] = process.argv;
  const svg = fs.readFileSync(svgPath, 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +size, height: +size }, deviceScaleFactor: 1 });
  await p.setContent(`<html><body style="margin:0;background:${fundo || 'transparent'}">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: out, omitBackground: !fundo });
  await b.close();
})();
