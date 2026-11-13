// Gera os ícones do PWA a partir do desenho da etiqueta da Mundo Mix.
// Uso: node ferramentas/gerar-icones.js   (grava em public/icons e public/favicon.png)
// Prévia sem gravar: node ferramentas/gerar-icones.js --previa <arquivo.png>
const { chromium } = require('playwright');
const path = require('path');

const tinta = '#172130', amarelo = '#FFD447', borda = '#E3B81F';
// Etiqueta amarela de gaveta (com o furo) e "MM" (Mundo Mix) ocupando o espaço à direita do
// furo; "maskable" encolhe o desenho para caber na área segura de 80% que o Android recorta.
const svg = (maskable, quadrado = maskable) => {
  const s = maskable ? 0.72 : 0.86, d = (1 - s) * 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${quadrado ? 0 : 108}" fill="${tinta}"/>
  <g transform="translate(${d} ${d}) scale(${s})">
    <rect x="86" y="146" width="340" height="220" rx="26" fill="${amarelo}" stroke="${borda}" stroke-width="10"/>
    <circle cx="140" cy="256" r="22" fill="${tinta}"/>
    <text x="292" y="306" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="140" textLength="222" lengthAdjust="spacingAndGlyphs" fill="${tinta}">MM</text>
  </g>
</svg>`;
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const previa = process.argv.indexOf('--previa');
  if (previa > 0) {
    // Lado a lado: 512 normal, 512 maskable recortado em círculo (Android) e 48 (favicon) ampliado
    await p.setViewportSize({ width: 1100, height: 520 });
    await p.setContent(`<body style="margin:0;display:flex;gap:20px;align-items:center;background:#ddd">${svg(false).replace('<svg ', '<svg width="512" height="512" ')}
      <div style="width:512px;height:512px;border-radius:50%;overflow:hidden">${svg(true).replace('<svg ', '<svg width="512" height="512" ')}</div>
      <img width="48" height="48" src="data:image/svg+xml,${encodeURIComponent(svg(false))}"></body>`);
    await p.screenshot({ path: process.argv[previa + 1] });
    await b.close();
    return console.log('prévia gravada');
  }
  const gerar = async (arquivo, tamanho, maskable = false, quadrado = maskable) => {
    await p.setViewportSize({ width: tamanho, height: tamanho });
    await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${tamanho}px;height:${tamanho}px}</style>${svg(maskable, quadrado)}`);
    await p.screenshot({ path: path.join(__dirname, '..', 'public', arquivo), omitBackground: true });
  };
  for (const t of [72, 96, 128, 144, 152, 192, 384, 512]) await gerar(`icons/icon-${t}x${t}.png`, t);
  await gerar('icons/maskable-512x512.png', 512, true);
  await gerar('icons/maskable-192x192.png', 192, true);
  await gerar('favicon.png', 48);
  // iPhone: sem cantos transparentes (o iOS arredonda sozinho)
  await gerar('icons/apple-touch-icon.png', 180, false, true);
  await b.close();
  console.log('ícones gerados');
})();
