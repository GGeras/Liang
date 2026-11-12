// Notinha: gera o PDF de 80 mm exatamente como o Chrome imprime (mesmo caminho do botão
// "Imprimir") e compara com a simulação em tamanho real, pixel a pixel.
// Uso:  npm run build && node ferramentas/notinha-pdf.js [pasta]
// Requer o pdf.js para rasterizar o PDF (não entra no package.json):  npm i --no-save pdfjs-dist@4.10.38
// Saída por venda: <nome>.pdf, <nome>-comparacao.png (PDF | simulação | diferença em vermelho).
// Os dois lados viram preto e branco antes de comparar, como na térmica (ela não imprime cinza).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '..', '.auditoria', 'notinha-pdf');
fs.mkdirSync(OUT, { recursive: true });
const root = path.join(__dirname, '..', 'dist', 'liang', 'browser');
let pdfjs;
try {
  pdfjs = path.dirname(require.resolve('pdfjs-dist/build/pdf.min.mjs'));
} catch {
  console.log('Falta o pdf.js: npm i --no-save pdfjs-dist@4.10.38');
  process.exit(1);
}

const uid = '11111111-1111-1111-1111-111111111111';
const U = (p) => `${p}-0000-4000-8000-000000000000`;
const vi = (q, p, cod, nome, v, barras = null) => ({ quantidade: q, preco_unitario: p, variacoes: { nome: v, codigo_barras: barras, produtos: { codigo: cod, nome } } });
const base = { tipo_preco: 'varejo', forma_pagamento: 'pix', status: 'concluida', criada_em: '2026-11-08T14:10:00Z', offline: false, motivo_cancelamento: null, vendedor: { nome: 'Carlos Eduardo Albuquerque' } };
const itens15 = Array.from({ length: 15 }, (_, i) => vi(i + 1, 25 + i * 10, i % 3 ? `0${(i % 4) + 1}-0${(i % 7) + 1}` : null, i % 2 ? 'Tela Samsung Galaxy A32 5G com aro e digitalizador' : 'Conector de carga Tipo-C', i % 2 ? 'Preta' : 'Padrão', i % 3 ? null : '7891234567890'));
const soma = (l) => l.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);
const vendas = {
  curta: { ...base, id: U('c0a1b2c3'), cliente_nome: 'João', forma_pagamento: 'dinheiro', venda_itens: [vi(1, 18, '03-01', 'Conector de carga Tipo-C', 'Padrão')] },
  'nome-longo': { ...base, id: U('a1b2c3d4'), cliente_nome: 'Assistência Técnica Cell Center Uberlândia', tipo_preco: 'atacado', venda_itens: [vi(10, 175, '01-02', 'Tela Samsung Galaxy A32 5G com aro, digitalizador e película de proteção instalada de fábrica', 'Preta'), vi(2, 12, null, 'Película de vidro 3D Samsung Galaxy A54 5G com borda preta', 'Padrão', '7891234567890')] },
  '15-itens': { ...base, id: U('15151515'), cliente_nome: 'Distribuidora de Peças Triângulo Mineiro Ltda', forma_pagamento: 'cartao', venda_itens: itens15 },
  cancelada: { ...base, id: U('b1b1b1b1'), cliente_nome: 'Maria', status: 'cancelada', motivo_cancelamento: 'Cliente desistiu', venda_itens: [vi(1, 120, '01-01', 'Tela iPhone 11', 'Incell')] },
};
for (const v of Object.values(vendas)) v.total = soma(v.venda_itens);
const loja = { nome: 'Mundo Mix', endereco: 'R. Cel. Antônio Alves Pereira, 221 - Centro, Uberlândia - MG, 38400-104', telefone: '(34) 99928-3648', rodape: 'Peça certa, preço justo, no centro de Uberlândia. Obrigado pela preferência!' };
function resp(u, accept) {
  if (u.includes('/perfis')) return accept.includes('pgrst.object') ? { id: uid, nome: 'José', papel: 'admin', ativo: true } : [];
  if (u.includes('/loja')) return [loja];
  if (u.includes('/vendas')) { const id = (u.match(/[?&]id=eq\.([^&]+)/) || [])[1]; return Object.values(vendas).filter((v) => v.id === id); }
  return [];
}

let pdfAtual = Buffer.alloc(0);
const srv = http.createServer((q, r) => {
  const url = decodeURIComponent(q.url.split('?')[0]);
  if (url === '/__notinha.pdf') { r.setHeader('Content-Type', 'application/pdf'); return r.end(pdfAtual); }
  if (url.startsWith('/__pdfjs/')) { r.setHeader('Content-Type', 'text/javascript'); return fs.createReadStream(path.join(pdfjs, url.slice(9))).pipe(r); }
  if (url === '/__comparar.html') { r.setHeader('Content-Type', 'text/html'); return r.end('<!doctype html><body></body>'); }
  let f = path.join(root, url);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
  r.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(r);
}).listen(4302);

const DPR = 2, PX_MM = 96 / 25.4;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: DPR });
  await ctx.route('**/*supabase.co/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resp(rt.request().url(), rt.request().headers()['accept'] || '')) }));
  await ctx.route('**/fonts.googleapis.com/**', (rt) => rt.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERRO JS', e.message));
  await p.goto('http://localhost:4302/entrar');
  await p.evaluate((uid) => localStorage.setItem('liang-auth', JSON.stringify({ access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: { id: uid, email: 'a@a.com', aud: 'authenticated', role: 'authenticated' } })), uid);
  const cmp = await ctx.newPage();
  await cmp.goto('http://localhost:4302/__comparar.html');
  let falhou = false;

  for (const [nome, v] of Object.entries(vendas)) {
    await p.goto('http://localhost:4302/notinha/' + v.id);
    await p.waitForSelector('app-simulacao-notinha .notinha');
    await p.click('app-simulacao-notinha .controles .btn'); // Ver tamanho real (1:1)
    await p.waitForTimeout(300);
    // A barra de abas é fixa e cobriria a notinha alta na captura
    await p.addStyleTag({ content: 'nav.abas { display: none !important }' });
    const sim = await p.locator('app-simulacao-notinha app-notinha').screenshot();
    const altSimMm = (await p.locator('app-simulacao-notinha app-notinha').evaluate((e) => e.offsetHeight)) / PX_MM;

    // Botão Imprimir de verdade; o diálogo de impressão é trocado por um PDF do Chrome
    await p.evaluate(() => { window.print = () => {}; });
    await p.click('main .btn.bloco');
    await p.waitForSelector('#impressao app-notinha .notinha', { state: 'attached' });
    await p.waitForTimeout(200);
    pdfAtual = await p.pdf({ preferCSSPageSize: true });
    fs.writeFileSync(`${OUT}/${nome}.pdf`, pdfAtual);
    const caixas = [...pdfAtual.toString('latin1').matchAll(/MediaBox \[([^\]]+)\]/g)].map((m) => m[1].split(/\s+/).map(Number));
    const [, , wPt, hPt] = caixas[0];
    const wMm = (wPt / 72) * 25.4, hMm = (hPt / 72) * 25.4;

    const r = await cmp.evaluate(async ({ simB64, dpr }) => {
      const pdfjsLib = await import('/__pdfjs/pdf.min.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/__pdfjs/pdf.worker.min.mjs';
      const doc = await pdfjsLib.getDocument('/__notinha.pdf').promise;
      const pg = await doc.getPage(1);
      const vp = pg.getViewport({ scale: (dpr * 96) / 72 });
      const cp = Object.assign(document.createElement('canvas'), { width: Math.round(vp.width), height: Math.round(vp.height) });
      const cpx = cp.getContext('2d');
      cpx.fillStyle = '#fff'; cpx.fillRect(0, 0, cp.width, cp.height);
      await pg.render({ canvasContext: cpx, viewport: vp }).promise;
      const img = new Image(); img.src = 'data:image/png;base64,' + simB64; await img.decode();
      const W = Math.min(cp.width, img.width), H = Math.max(cp.height, img.height);
      const cs = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
      const csx = cs.getContext('2d'); csx.drawImage(img, 0, 0);
      const a = cpx.getImageData(0, 0, cp.width, cp.height), s = csx.getImageData(0, 0, cs.width, cs.height);
      // Preto ou branco, como a térmica
      const preto = (d, w, h, x, y) => x < w && y < h && (() => { const i = (y * w + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 140; })();
      const out = Object.assign(document.createElement('canvas'), { width: W * 3 + 40, height: H });
      const ox = out.getContext('2d'); ox.fillStyle = '#fff'; ox.fillRect(0, 0, out.width, out.height);
      const od = ox.getImageData(0, 0, out.width, out.height);
      const pinta = (x, y, c) => { const i = (y * out.width + x) * 4; od.data.set(c, i); };
      let tinta = 0, diferente = 0, isolado = 0;
      // Só a área impressa (72 mm no meio dos 80 mm): a borda da captura pode pegar o fundo escuro da simulação
      const x0 = Math.round(3 * dpr * 96 / 25.4), x1 = Math.min(W, Math.round(77 * dpr * 96 / 25.4));
      for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) {
        const p1 = preto(a.data, cp.width, cp.height, x, y), p2 = preto(s.data, cs.width, cs.height, x, y);
        if (p1) pinta(x, y, [0, 0, 0, 255]);
        if (p2) pinta(x + W + 20, y, [0, 0, 0, 255]);
        if (p1 || p2) tinta++;
        if (p1 !== p2) {
          diferente++;
          pinta(x + 2 * W + 40, y, [220, 0, 0, 255]);
          // Diferença de verdade (não só a borda de uma letra): o outro lado não tem tinta a até 3 px (0,4 mm)
          const outro = p1 ? s : a, ow = p1 ? cs.width : cp.width, oh = p1 ? cs.height : cp.height;
          let perto = false;
          for (let dy = -3; dy <= 3 && !perto; dy++) for (let dx = -3; dx <= 3 && !perto; dx++) if (preto(outro.data, ow, oh, x + dx, y + dy) === (p1 || p2)) perto = true;
          if (!perto) { isolado++; pinta(x + 2 * W + 40, y, [0, 90, 255, 255]); }
        } else if (p1) pinta(x + 2 * W + 40, y, [190, 190, 190, 255]);
      }
      ox.putImageData(od, 0, 0);
      return { png: out.toDataURL('image/png').split(',')[1], tinta, diferente, isolado, wPdf: cp.width, hPdf: cp.height, wSim: cs.width, hSim: cs.height };
    }, { simB64: sim.toString('base64'), dpr: DPR });
    fs.writeFileSync(`${OUT}/${nome}-comparacao.png`, Buffer.from(r.png, 'base64'));
    const pct = ((100 * r.isolado) / Math.max(1, r.tinta)).toFixed(2).replace('.', ',');
    const ok = caixas.length === 1 && Math.abs(wMm - 80) < 0.3 && Math.abs(hMm - altSimMm) < 1 /* a altura da página é arredondada para cima em 0,5 mm */ && r.isolado / Math.max(1, r.tinta) < 0.002;
    if (!ok) falhou = true;
    console.log(`${ok ? 'IGUAL' : 'DIFERENTE'} ${nome}: PDF ${caixas.length} página(s) de ${wMm.toFixed(1)} × ${hMm.toFixed(1)} mm · simulação ${altSimMm.toFixed(1)} mm de altura · diferença ${pct}% da tinta (deslocamentos de até 0,4 mm na borda das letras: ignorados)`);
  }
  console.log(`Arquivos em ${OUT}`);
  await b.close(); srv.close();
  process.exit(falhou ? 1 : 0);
})();
