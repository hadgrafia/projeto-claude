// Gera todos os ícones e telas de abertura a partir dos SVGs desta pasta.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..');
const svg = (n) => fs.readFileSync(path.join(__dirname, n), 'utf8');
const VERDE = '#3B4A3A';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  async function png(arquivo, largura, altura, conteudo, tamanhoDesenho, fundo) {
    await p.setViewportSize({ width: largura, height: altura });
    const s = conteudo.replace('<svg ', `<svg width="${tamanhoDesenho}" height="${tamanhoDesenho}" `);
    await p.setContent(`<html><body style="margin:0;width:${largura}px;height:${altura}px;display:flex;align-items:center;justify-content:center;background:${fundo ?? 'transparent'}">${s}</body></html>`);
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    await p.screenshot({ path: arquivo, omitBackground: !fundo });
  }
  // App web / PWA / iPhone
  const pub = path.join(R, 'public');
  fs.copyFileSync(path.join(__dirname, 'logo.svg'), path.join(pub, 'icon.svg'));
  fs.copyFileSync(path.join(__dirname, 'icone-cheio.svg'), path.join(pub, 'icon-maskable.svg'));
  await png(path.join(pub, 'icon-192.png'), 192, 192, svg('logo.svg'), 192);
  await png(path.join(pub, 'icon-512.png'), 512, 512, svg('logo.svg'), 512);
  await png(path.join(pub, 'icon-maskable-512.png'), 512, 512, svg('icone-cheio.svg'), 512);
  await png(path.join(pub, 'apple-touch-icon.png'), 180, 180, svg('icone-cheio.svg'), 180);
  // Android: ícones
  const res = path.join(R, 'android/app/src/main/res');
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, f] of Object.entries(dens)) {
    const icone = Math.round(48 * f);
    const frente = Math.round(108 * f);
    await png(path.join(res, `mipmap-${d}/ic_launcher.png`), icone, icone, svg('logo.svg'), icone);
    await png(path.join(res, `mipmap-${d}/ic_launcher_round.png`), icone, icone, svg('icone-cheio.svg').replace('<svg ', '<svg style="border-radius:50%" '), icone);
    await png(path.join(res, `mipmap-${d}/ic_launcher_foreground.png`), frente, frente, svg('simbolo.svg'), frente);
  }
  // Android: telas de abertura
  for (const arq of fs.readdirSync(res).filter((x) => x.startsWith('drawable'))) {
    const alvo = path.join(res, arq, 'splash.png');
    if (!fs.existsSync(alvo)) continue;
    const dim = (await p.evaluate(() => 0), require('child_process').execSync(`file "${alvo}"`).toString().match(/(\d+) x (\d+)/));
    const [l, a] = [+dim[1], +dim[2]];
    await png(alvo, l, a, svg('simbolo.svg'), Math.round(Math.min(l, a) * 0.42), VERDE);
  }
  await b.close();
  console.log('ícones e telas de abertura gerados');
})();
