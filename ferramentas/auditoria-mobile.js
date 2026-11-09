// Auditoria de layout mobile do Liang, com dados fictícios (não acessa o Supabase).
// Uso:  npm run build && node ferramentas/auditoria-mobile.js <largura> [pasta] [admin|vendedor]
// Saída: capturas de todas as telas e folhas + relatorio.json; imprime ESTOURA/PAGINA/ERRO JS.
// Os dados de teste usam nomes longos de propósito para forçar quebras.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const W = +process.argv[2] || 360, OUT = process.argv[3] || path.join(__dirname, '..', '.auditoria', String(+process.argv[2] || 360)), PAPEL = process.argv[4] || 'admin';
fs.mkdirSync(OUT, { recursive: true });
// Modo acessibilidade (ferramentas/acessibilidade.js): roda o @accesslint/core em cada tela e folha.
const A11Y = process.env.LIANG_A11Y === '1';
const acesso = {};
const root = path.join(__dirname, '..', 'dist', 'liang', 'browser');
const srv = http.createServer((q, r) => {
  let f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
  r.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(r);
}).listen(4301);
const uid = '11111111-1111-1111-1111-111111111111';
let n = 0;
const item = (codigo, nome, variacao, pa, pv, est, min, tipo, tid, marca = 'Samsung', compat = []) => ({ variacao_id: 'v' + (n++), produto_id: codigo, codigo, tipo_id: tid, tipo, nome, marca, modelo: 'Galaxy A32 5G', descricao: 'Tela com aro, testada antes do envio. Garantia de 90 dias contra defeito de fábrica.', foto_url: null, variacao, preco_atacado: pa, preco_varejo: pv, codigo_barras: codigo === '03-01' ? '7891234567890' : null, estoque_minimo: min, estoque: est, compativeis: compat });
const cat = [
  item('01-01', 'Tela iPhone 11', 'Incell', 80, 120, 7, 2, 'Telas', 1, 'Apple', ['iPhone XR']),
  item('01-01', 'Tela iPhone 11', 'OLED original retirada', 1150, 2220, 2, 2, 'Telas', 1, 'Apple'),
  item('01-01', 'Tela iPhone 11', 'JK', 95, 140, 0, 1, 'Telas', 1, 'Apple'),
  item('01-02', 'Tela Samsung Galaxy A32 5G com aro e digitalizador', 'Preta', 175, 260, 3, 2, 'Telas', 1, 'Samsung', ['Galaxy A32 4G', 'Galaxy A325M']),
  item('02-01', 'Tampa traseira Motorola Moto G52 / G82', 'Azul petróleo metálico', 25, 45, 12, 3, 'Tampas traseiras', 2, 'Motorola'),
  item('03-01', 'Conector de carga Tipo-C', 'Padrão', 8, 18, 130, 5, 'Conectores de carga', 3, 'Genérico'),
  item('04-01', 'Bateria Xiaomi Redmi Note 11 Pro BN5E', 'Padrão', 48.5, 89.9, 4, 3, 'Baterias', 4, 'Xiaomi'),
];
const resumo = { faturamento: 128845.5, vendas: 1023, itens: 2441, ticket_medio: 1123.72, lucro_estimado: 41012.4, itens_sem_custo: 3,
  por_dia: Array.from({ length: 30 }, (_, i) => ({ dia: `2026-10-${String(i + 1).padStart(2, '0')}`, total: 1000 + ((i * 937) % 4000), vendas: 3 })),
  por_vendedor: [{ nome: 'Carlos Eduardo Albuquerque', total: 76500, vendas: 513 }, { nome: 'Ana', total: 52345.5, vendas: 510 }],
  por_pagamento: { pix: 70000, dinheiro: 38845.5, cartao: 20000 }, por_tipo_preco: { atacado: 60200, varejo: 68645.5 },
  mais_vendidos: [{ codigo: '03-01', produto: 'Conector de carga Tipo-C', variacao: 'Padrão', quantidade: 1140, total: 200 }, { codigo: '01-02', produto: 'Tela Samsung Galaxy A32 5G com aro e digitalizador', variacao: 'Preta', quantidade: 9, total: 900 }],
  estoque_baixo: [{ codigo: '01-01', produto: 'Tela iPhone 11', variacao: 'JK', estoque: 0, minimo: 1 }, { codigo: '04-01', produto: 'Bateria Xiaomi Redmi Note 11 Pro BN5E', variacao: 'Padrão', estoque: 4, minimo: 13 }],
  valor_estoque: { custo: 14210, varejo: 129870 }, ocorrencias_abertas: 2 };
const vi = (q, p, cod, nome, v) => ({ quantidade: q, preco_unitario: p, variacoes: { nome: v, produtos: { codigo: cod, nome } } });
const vendas = [
  { id: 'a1b2c3d4-0000', cliente_nome: 'Assistência Técnica Cell Center Uberlândia', tipo_preco: 'atacado', forma_pagamento: 'pix', total: 1845, status: 'concluida', criada_em: '2026-11-08T14:10:00Z', offline: true, motivo_cancelamento: null, vendedor: { nome: 'Carlos Eduardo Albuquerque' }, venda_itens: [vi(10, 175, '01-02', 'Tela Samsung Galaxy A32 5G com aro e digitalizador', 'Preta'), vi(5, 19, '03-01', 'Conector de carga Tipo-C', 'Padrão')] },
  { id: 'b1', cliente_nome: 'Maria', tipo_preco: 'varejo', forma_pagamento: 'cartao', total: 120, status: 'cancelada', criada_em: '2026-11-08T12:00:00Z', offline: false, motivo_cancelamento: 'Cliente desistiu da compra após teste no balcão', vendedor: { nome: 'Ana' }, venda_itens: [vi(1, 120, '01-01', 'Tela iPhone 11', 'Incell')] },
];
const movs = [
  { id: 1, tipo: 'ajuste', quantidade: -3, saldo_apos: 4, custo_unitario: null, motivo: 'Contagem de inventário mensal: 3 telas quebradas no transporte', criado_em: '2026-11-08T13:00:00Z', perfis: { nome: 'Carlos Eduardo Albuquerque' }, variacoes: { nome: 'OLED original retirada', produtos: { codigo: '01-01', nome: 'Tela iPhone 11' } } },
  { id: 2, tipo: 'entrada', quantidade: 120, saldo_apos: 130, custo_unitario: 6, motivo: null, criado_em: '2026-11-08T12:00:00Z', perfis: { nome: 'José' }, variacoes: { nome: 'Padrão', produtos: { codigo: '03-01', nome: 'Conector de carga Tipo-C' } } },
];
const ocorr = [{ id: 'o1', tipo: 'venda_sem_estoque', mensagem: 'Venda recusada por falta de estoque (registrada offline)', resolvida: false, criado_em: '2026-11-08T14:00:00Z', resolvida_em: null, usuario: { nome: 'Carlos Eduardo Albuquerque' }, dados: { cliente: 'Assistência Técnica Cell Center', criada_em: '2026-11-08T13:40:00Z', faltando: [{ codigo: '01-02', produto: 'Tela Samsung Galaxy A32 5G com aro e digitalizador', variacao: 'Preta', pedido: 4, disponivel: 1 }] } }];
const perfis = [{ id: uid, nome: 'José', papel: 'admin', ativo: true }, { id: '2', nome: 'Carlos Eduardo Albuquerque dos Santos', papel: 'vendedor', ativo: true }, { id: '3', nome: 'Ana', papel: 'vendedor', ativo: false }];
const produtosLista = [
  { id: '01-02', codigo: '01-02', tipo_id: 1, nome: 'Tela Samsung Galaxy A32 5G com aro e digitalizador', marca: 'Samsung', modelo: 'A32', ativo: true, variacoes: [{ nome: 'Preta', ativo: true }, { nome: 'Azul', ativo: true }, { nome: 'Branca com aro prata', ativo: true }], compatibilidades: [{ status: 'a_confirmar' }, { status: 'a_confirmar' }] },
  { id: '01-01', codigo: '01-01', tipo_id: 1, nome: 'Tela iPhone 11', marca: 'Apple', modelo: null, ativo: false, variacoes: [{ nome: 'Incell', ativo: true }], compatibilidades: [] },
];
const produto = { id: '01-02', tipo_id: 1, seq: 2, nome: 'Tela Samsung Galaxy A32 5G com aro e digitalizador', marca: 'Samsung', modelo: 'Galaxy A32 5G', descricao: 'Com aro.', foto_url: null, ativo: true,
  variacoes: [{ id: 'x1', nome: 'Preta', preco_atacado: 175, preco_varejo: 260, custo: 120, codigo_barras: '7891234567890', estoque_minimo: 2, ativo: true }],
  compatibilidades: [{ id: 'c1', modelo: 'Galaxy A32 4G (SM-A325M)', status: 'confirmada', observacao: null }, { id: 'c2', modelo: 'Galaxy M32', status: 'a_confirmar', observacao: 'Verificar conector do flex' }] };
const tipos = [{ id: 1, nome: 'Telas' }, { id: 2, nome: 'Tampas traseiras' }, { id: 3, nome: 'Conectores de carga' }, { id: 4, nome: 'Baterias' }];
function resp(u, accept) {
  if (u.includes('/perfis')) return accept.includes('pgrst.object') ? { id: uid, nome: PAPEL === 'admin' ? 'José' : 'Carlos Eduardo Albuquerque', papel: PAPEL, ativo: true } : perfis;
  if (u.includes('vw_catalogo')) return cat;
  if (u.includes('dashboard_resumo')) return resumo;
  if (u.includes('/vendas')) return vendas;
  if (u.includes('/movimentos')) return movs;
  if (u.includes('/ocorrencias')) return ocorr;
  if (u.includes('/tipos')) return tipos;
  if (u.includes('alteracoes_catalogo')) return [{ id: 1, tabela: 'variacoes', acao: 'alterado', antes: { nome: 'Preta', preco_varejo: 240, preco_atacado: 170 }, depois: { nome: 'Preta', preco_varejo: 260, preco_atacado: 175 }, criado_em: '2026-11-08T15:00:00Z', perfis: { nome: 'Carlos Eduardo Albuquerque' } }, { id: 2, tabela: 'compatibilidades', acao: 'criado', antes: null, depois: { modelo: 'Galaxy M32' }, criado_em: '2026-11-08T14:00:00Z', perfis: { nome: 'José' } }];
  if (u.includes('/produtos')) return accept.includes('pgrst.object') ? produto : (u.includes('select=seq') ? [] : produtosLista);
  return [];
}
const telas = PAPEL === 'admin'
  ? ['/vender', '/catalogo', '/admin/painel', '/admin/estoque', '/admin/mais', '/admin/produtos', '/admin/produtos/01-02', '/admin/produtos/novo', '/admin/vendas', '/admin/movimentos', '/admin/ocorrencias', '/admin/usuarios']
  : ['/vender', '/catalogo', '/minhas-vendas'];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: 760 }, deviceScaleFactor: 1 });
  await ctx.route('**/*supabase.co/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resp(rt.request().url(), rt.request().headers()['accept'] || '')) }));
  await ctx.route('**/fonts.googleapis.com/**', (rt) => rt.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERRO JS', e.message));
  await p.goto('http://localhost:4301/entrar'); await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/00-entrar.png` });
  await p.evaluate((uid) => localStorage.setItem('liang-auth', JSON.stringify({ access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: { id: uid, email: 'a@a.com', aud: 'authenticated', role: 'authenticated' } })), uid);
  const relatorio = {};
  const checar = async (nome) => {
    relatorio[nome] = await p.evaluate((W) => {
      const out = [];
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      for (const e of document.querySelectorAll('body *')) {
        if (!vis(e) || e.closest('svg')) continue;
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        if (r.right > W + 1 && cs.position !== 'fixed' && !e.closest('.rolagem-x')) out.push(`ESTOURA ${e.tagName}.${e.className} right=${Math.round(r.right)}`);
        if (e.scrollWidth > e.clientWidth + 1 && cs.overflowX === 'hidden' && cs.textOverflow !== 'ellipsis') out.push(`CORTADO ${e.tagName}.${e.className}`);
      }
      if (document.documentElement.scrollWidth > W) out.push(`PAGINA scrollWidth=${document.documentElement.scrollWidth}`);
      return [...new Set(out)];
    }, W);
    if (A11Y) {
      await p.waitForTimeout(350); // espera a animação da folha terminar (opacidade parcial distorce o contraste)
      if (!(await p.evaluate(() => 'AccessLint' in window))) await p.addScriptTag({ path: require.resolve('@accesslint/core/iife') });
      acesso[nome] = await p.evaluate(() =>
        AccessLint.runAudit(document).violations.map((v) => ({ regra: v.ruleId, impacto: v.impact, seletor: v.selector, msg: v.message, html: v.html.slice(0, 160) })),
      );
    }
  };
  for (const t of telas) {
    await p.goto('http://localhost:4301' + t); await p.waitForTimeout(700);
    const nome = t.replace(/\//g, '_').replace(/^_/, '');
    await checar(nome);
    await p.screenshot({ path: `${OUT}/${nome}.png`, fullPage: true });
  }
  // fluxos com folhas
  await p.goto('http://localhost:4301/vender'); await p.waitForTimeout(600);
  await p.fill('#codigo', '0101'); await p.waitForTimeout(300);
  await checar('folha-variacao'); await p.screenshot({ path: `${OUT}/folha-variacao.png` });
  await p.click('dialog[open] .opcao >> nth=1'); await p.waitForTimeout(200);
  await p.fill('#codigo', '0102'); await p.waitForTimeout(200);
  await p.fill('#codigo', '0201'); await p.waitForTimeout(200);
  await p.fill('#codigo', '9999'); await p.waitForTimeout(200);
  await checar('vender-carrinho'); await p.screenshot({ path: `${OUT}/vender-carrinho.png`, fullPage: true });
  await p.click('text=Atacado'); await p.click('text=Finalizar venda');
  await p.fill('dialog[open] input', 'Assistência Técnica Cell Center Uberlândia Ltda');
  await checar('folha-finalizar'); await p.screenshot({ path: `${OUT}/folha-finalizar.png` });
  await p.click('dialog[open] button:has-text("Pix")'); await p.click('text=Revisar venda'); await p.waitForTimeout(200);
  await checar('folha-confirmar'); await p.screenshot({ path: `${OUT}/folha-confirmar.png` });
  if (PAPEL === 'admin') {
    await p.goto('http://localhost:4301/admin/estoque'); await p.waitForTimeout(600);
    await p.click('.linha >> nth=1'); await p.waitForTimeout(200);
    await checar('folha-estoque'); await p.screenshot({ path: `${OUT}/folha-estoque.png` });
    await p.goto('http://localhost:4301/catalogo'); await p.waitForTimeout(600);
    await p.click('.produto >> nth=1'); await p.waitForTimeout(200);
    await checar('folha-catalogo'); await p.screenshot({ path: `${OUT}/folha-catalogo.png` });
  }
  fs.writeFileSync(`${OUT}/relatorio.json`, JSON.stringify(relatorio, null, 1));
  if (A11Y) {
    fs.writeFileSync(`${OUT}/acessibilidade.json`, JSON.stringify(acesso, null, 1));
    for (const [k, v] of Object.entries(acesso)) if (v.length) console.log('## a11y', k, '\n  ' + v.map((x) => `[${x.impacto}] ${x.regra} · ${x.seletor} · ${x.msg}`).join('\n  '));
  }
  for (const [k, v] of Object.entries(relatorio)) if (v.length) console.log('##', k, '\n  ' + v.join('\n  '));
  await b.close(); srv.close();
})();
