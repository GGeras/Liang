// Gera os ícones do PWA a partir do desenho da etiqueta do Liang.
// Uso: node ferramentas/gerar-icones.js   (grava em public/icons e public/favicon.png)
const { chromium } = require('playwright');
const path = require('path');

const tinta = '#172130', amarelo = '#FFD447', borda = '#E3B81F';
// Etiqueta amarela de gaveta (com o furo) e um "L" grande; "maskable" encolhe o desenho
// para caber na área segura de 80% que o Android recorta em círculo/squircle.
const svg = (maskable, quadrado = maskable) => {
  const s = maskable ? 0.72 : 0.86, d = (1 - s) * 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${quadrado ? 0 : 108}" fill="${tinta}"/>
  <g transform="translate(${d} ${d}) scale(${s})">
    <rect x="86" y="146" width="340" height="220" rx="26" fill="${amarelo}" stroke="${borda}" stroke-width="10"/>
    <circle cx="140" cy="256" r="22" fill="${tinta}"/>
    <text x="290" y="330" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="210" fill="${tinta}">L</text>
  </g>
</svg>`;
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
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
