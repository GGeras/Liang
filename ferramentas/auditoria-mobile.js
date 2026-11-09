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
// Mesma CSP do Cloudflare Pages (public/_headers): qualquer bloqueio aparece como "CSP" na saída
const CSP = (fs.readFileSync(path.join(__dirname, '..', 'public', '_headers'), 'utf8').match(/Content-Security-Policy:\s*(.+)/) || [])[1];
const srv = http.createServer((q, r) => {
  if (CSP) r.setHeader('Content-Security-Policy', CSP);
  let f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
  r.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(r);
}).listen(4301);
const uid = '11111111-1111-1111-1111-111111111111';
let n = 0;
const item = (codigo, nome, variacao, pa, pv, est, min, tipo, tid, marca = 'Samsung', compat = [], barras = null) => ({ variacao_id: 'v' + (n++), produto_id: codigo ?? 'p-' + nome.length, codigo, tipo_id: tid, tipo, nome, marca, modelo: 'Galaxy A32 5G', descricao: 'Tela com aro, testada antes do envio. Garantia de 90 dias contra defeito de fábrica.', foto_url: null, variacao, preco_atacado: pa, preco_varejo: pv, codigo_barras: barras, estoque_minimo: min, estoque: est, compativeis: compat });
const cat = [
  item('01-01', 'Tela iPhone 11', 'Incell', 80, 120, 7, 2, 'Telas', 1, 'Apple', ['iPhone XR']),
  item('01-01', 'Tela iPhone 11', 'OLED original retirada', 1150, 2220, 2, 2, 'Telas', 1, 'Apple'),
  item('01-01', 'Tela iPhone 11', 'JK', 95, 140, 0, 1, 'Telas', 1, 'Apple'),
  item('01-02', 'Tela Samsung Galaxy A32 5G com aro e digitalizador', 'Preta', 175, 260, 3, 2, 'Telas', 1, 'Samsung', ['Galaxy A32 4G', 'Galaxy A325M']),
  item('02-01', 'Tampa traseira Motorola Moto G52 / G82', 'Azul petróleo metálico', 25, 45, 12, 3, 'Tampas traseiras', 2, 'Motorola'),
  item('03-01', 'Conector de carga Tipo-C', 'Padrão', 8, 18, 130, 5, 'Conectores de carga', 3, 'Genérico'),
  item('04-01', 'Bateria Xiaomi Redmi Note 11 Pro BN5E', 'Padrão', 48.5, 89.9, 4, 3, 'Baterias', 4, 'Xiaomi'),
  // Produtos com código de barras: sem 00-00
  item(null, 'Película de vidro 3D Samsung Galaxy A54 5G com borda preta', 'Padrão', 12, 25, 40, 5, 'Películas', 5, 'Samsung', [], '7891234567890'),
  item(null, 'Capa de silicone aveludada iPhone 13', 'Preta', 15, 35, 6, 2, 'Películas', 5, 'Apple', [], '7890000000123'),
  item(null, 'Capa de silicone aveludada iPhone 13', 'Azul-marinho', 15, 35, 0, 2, 'Películas', 5, 'Apple', [], '7890000000124'),
];
const resumo = { faturamento: 128845.5, vendas: 1023, itens: 2441, ticket_medio: 1123.72, lucro_estimado: 41012.4, itens_sem_custo: 3,
  por_dia: Array.from({ length: 30 }, (_, i) => ({ dia: `2026-10-${String(i + 1).padStart(2, '0')}`, total: 1000 + ((i * 937) % 4000), vendas: 3 })),
  por_vendedor: [{ nome: 'Carlos Eduardo Albuquerque', total: 76500, vendas: 513 }, { nome: 'Ana', total: 52345.5, vendas: 510 }],
  por_pagamento: { pix: 70000, dinheiro: 38845.5, cartao: 20000 }, por_tipo_preco: { atacado: 60200, varejo: 68645.5 },
  mais_vendidos: [{ codigo: '03-01', produto: 'Conector de carga Tipo-C', variacao: 'Padrão', quantidade: 1140, total: 200 }, { codigo: '01-02', produto: 'Tela Samsung Galaxy A32 5G com aro e digitalizador', variacao: 'Preta', quantidade: 9, total: 900 }, { codigo: null, codigo_barras: '7891234567890', produto: 'Película de vidro 3D Samsung Galaxy A54 5G com borda preta', variacao: 'Padrão', quantidade: 300, total: 7500 }],
  estoque_baixo: [{ codigo: '01-01', produto: 'Tela iPhone 11', variacao: 'JK', estoque: 0, minimo: 1 }, { codigo: '04-01', produto: 'Bateria Xiaomi Redmi Note 11 Pro BN5E', variacao: 'Padrão', estoque: 4, minimo: 13 }, { codigo: null, codigo_barras: '7890000000124', produto: 'Capa de silicone aveludada iPhone 13', variacao: 'Azul-marinho', estoque: 0, minimo: 2 }],
  valor_estoque: { custo: 14210, varejo: 129870 }, ocorrencias_abertas: 2 };
const vi = (q, p, cod, nome, v, barras = null) => ({ quantidade: q, preco_unitario: p, variacoes: { nome: v, codigo_barras: barras, produtos: { codigo: cod, nome } } });
const vendas = [
  { id: 'a1b2c3d4-0000', cliente_nome: 'Assistência Técnica Cell Center Uberlândia', tipo_preco: 'atacado', forma_pagamento: 'pix', total: 1845, status: 'concluida', criada_em: '2026-11-08T14:10:00Z', offline: true, motivo_cancelamento: null, vendedor: { nome: 'Carlos Eduardo Albuquerque' }, venda_itens: [vi(10, 175, '01-02', 'Tela Samsung Galaxy A32 5G com aro e digitalizador', 'Preta'), vi(5, 19, '03-01', 'Conector de carga Tipo-C', 'Padrão'), vi(2, 12, null, 'Película de vidro 3D Samsung Galaxy A54 5G com borda preta', 'Padrão', '7891234567890')] },
  { id: 'b1', cliente_nome: 'Maria', tipo_preco: 'varejo', forma_pagamento: 'cartao', total: 120, status: 'cancelada', criada_em: '2026-11-08T12:00:00Z', offline: false, motivo_cancelamento: 'Cliente desistiu da compra após teste no balcão', vendedor: { nome: 'Ana' }, venda_itens: [vi(1, 120, '01-01', 'Tela iPhone 11', 'Incell')] },
];
const movs = [
  { id: 1, tipo: 'ajuste', quantidade: -3, saldo_apos: 4, custo_unitario: null, motivo: 'Contagem de inventário mensal: 3 telas quebradas no transporte', criado_em: '2026-11-08T13:00:00Z', perfis: { nome: 'Carlos Eduardo Albuquerque' }, variacoes: { nome: 'OLED original retirada', produtos: { codigo: '01-01', nome: 'Tela iPhone 11' } } },
  { id: 2, tipo: 'entrada', quantidade: 120, saldo_apos: 130, custo_unitario: 6, motivo: null, criado_em: '2026-11-08T12:00:00Z', perfis: { nome: 'José' }, variacoes: { nome: 'Padrão', codigo_barras: null, produtos: { codigo: '03-01', nome: 'Conector de carga Tipo-C' } } },
  { id: 3, tipo: 'entrada', quantidade: 50, saldo_apos: 50, custo_unitario: 4, motivo: null, criado_em: '2026-11-08T11:00:00Z', perfis: { nome: 'José' }, variacoes: { nome: 'Padrão', codigo_barras: '7891234567890', produtos: { codigo: null, nome: 'Película de vidro 3D Samsung Galaxy A54 5G com borda preta' } } },
];
const ocorr = [{ id: 'o1', tipo: 'venda_sem_estoque', mensagem: 'Venda recusada por falta de estoque (registrada offline)', resolvida: false, criado_em: '2026-11-08T14:00:00Z', resolvida_em: null, usuario: { nome: 'Carlos Eduardo Albuquerque' }, dados: { cliente: 'Assistência Técnica Cell Center', criada_em: '2026-11-08T13:40:00Z', faltando: [{ codigo: '01-02', produto: 'Tela Samsung Galaxy A32 5G com aro e digitalizador', variacao: 'Preta', pedido: 4, disponivel: 1 }, { codigo: null, codigo_barras: '7890000000124', produto: 'Capa de silicone aveludada iPhone 13', variacao: 'Azul-marinho', pedido: 1, disponivel: 0 }] } }];
const perfis = [{ id: uid, nome: 'José', papel: 'admin', ativo: true }, { id: '2', nome: 'Carlos Eduardo Albuquerque dos Santos', papel: 'vendedor', ativo: true }, { id: '3', nome: 'Ana', papel: 'vendedor', ativo: false }];
const produtosLista = [
  { id: '01-02', codigo: '01-02', tipo_id: 1, nome: 'Tela Samsung Galaxy A32 5G com aro e digitalizador', marca: 'Samsung', modelo: 'A32', ativo: true, variacoes: [{ nome: 'Preta', ativo: true, codigo_barras: null }, { nome: 'Azul', ativo: true, codigo_barras: null }, { nome: 'Branca com aro prata', ativo: true, codigo_barras: null }], compatibilidades: [{ status: 'a_confirmar' }, { status: 'a_confirmar' }] },
  { id: '01-01', codigo: '01-01', tipo_id: 1, nome: 'Tela iPhone 11', marca: 'Apple', modelo: null, ativo: false, variacoes: [{ nome: 'Incell', ativo: true, codigo_barras: null }], compatibilidades: [] },
  { id: 'p-barras', codigo: null, tipo_id: 5, nome: 'Película de vidro 3D Samsung Galaxy A54 5G com borda preta', marca: 'Samsung', modelo: null, ativo: true, variacoes: [{ nome: 'Padrão', ativo: true, codigo_barras: '7891234567890' }], compatibilidades: [] },
];
const produto = { id: '01-02', tipo_id: 1, seq: 2, nome: 'Tela Samsung Galaxy A32 5G com aro e digitalizador', marca: 'Samsung', modelo: 'Galaxy A32 5G', descricao: 'Com aro.', foto_url: null, ativo: true,
  variacoes: [{ id: 'x1', nome: 'Preta', preco_atacado: 175, preco_varejo: 260, custo: 120, codigo_barras: null, estoque_minimo: 2, ativo: true }],
  compatibilidades: [{ id: 'c1', modelo: 'Galaxy A32 4G (SM-A325M)', status: 'confirmada', observacao: null }, { id: 'c2', modelo: 'Galaxy M32', status: 'a_confirmar', observacao: 'Verificar conector do flex' }] };
const tipos = [{ id: 1, nome: 'Telas' }, { id: 2, nome: 'Tampas traseiras' }, { id: 3, nome: 'Conectores de carga' }, { id: 4, nome: 'Baterias' }, { id: 5, nome: 'Películas' }];
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
  // No modo acessibilidade o AccessLint é injetado como script: a CSP o bloquearia
  const ctx = await b.newContext({ viewport: { width: W, height: 760 }, deviceScaleFactor: 1, bypassCSP: A11Y });
  await ctx.route('**/*supabase.co/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resp(rt.request().url(), rt.request().headers()['accept'] || '')) }));
  await ctx.route('**/fonts.googleapis.com/**', (rt) => rt.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERRO JS', e.message));
  p.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) console.log('CSP', m.text().slice(0, 200));
    else if (m.type() === 'error') console.log('ERRO CONSOLE', m.text().slice(0, 200));
  });
  // Sem login: toda rota protegida precisa cair em /entrar (pega erros de guard, ex.: NG0203)
  for (const t of ['/', '/vender', '/admin/painel']) {
    await p.goto('http://localhost:4301' + t); await p.waitForTimeout(600);
    if (!p.url().endsWith('/entrar')) console.log('SEM LOGIN', t, 'não foi para /entrar:', p.url());
  }
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
        if (e.scrollWidth > e.clientWidth + 1 && cs.overflowX === 'hidden' && cs.textOverflow !== 'ellipsis' && !e.matches('.sr-only, .rotulo-opcional')) out.push(`CORTADO ${e.tagName}.${e.className}`);
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
  await p.fill('#codigo', '0101'); await p.waitForTimeout(450);
  await checar('folha-variacao'); await p.screenshot({ path: `${OUT}/folha-variacao.png` });
  await p.click('dialog[open] .opcao >> nth=1'); await p.waitForTimeout(200);
  await p.fill('#codigo', '0102'); await p.waitForTimeout(450);
  await p.fill('#codigo', '0201'); await p.waitForTimeout(450);
  await p.fill('#codigo', '9999'); await p.waitForTimeout(450);
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
  // Código de barras desconhecido (leitor USB digita e dá Enter): admin ganha o atalho de cadastro
  await p.goto('http://localhost:4301/vender'); await p.waitForTimeout(600);
  // Leitor de código de barras: digita número a número, rápido, e dá Enter.
  // Código cadastrado (7891234567890 = película, produto sem 00-00) entra no carrinho sem acusar "78-91" no meio
  // falhar() vibra [40,40,40]; adicionar() vibra 30. Uma leitura limpa só pode vibrar 30.
  await p.evaluate(() => { window.__vib = []; navigator.vibrate = (x) => (window.__vib.push(x), true); });
  // Pessoa digitando o 00-00 tecla a tecla (o campo põe o hífen sozinho): entra no carrinho sem Enter
  await p.locator('#codigo').pressSequentially('0201', { delay: 90 }); await p.waitForTimeout(450);
  const humano = await p.locator('.carrinho .etiqueta', { hasText: '02-01' }).count();
  if (!humano) console.log('CODIGO digitando 0201 devagar não adicionou 02-01 ao carrinho');
  await p.evaluate(() => { window.__vib = []; });
  await p.locator('#codigo').pressSequentially('7891234567890', { delay: 8 }); await p.press('#codigo', 'Enter'); await p.waitForTimeout(400);
  const vib = await p.evaluate(() => JSON.stringify(window.__vib));
  const noCarrinho = await p.locator('.carrinho .barras-id', { hasText: '7891234567890' }).count();
  if (!noCarrinho || vib !== '[30]') console.log('BARRAS leitor: película no carrinho =', noCarrinho, '· vibrações =', vib, '(esperado [30])');
  await p.locator('#codigo').pressSequentially('7890000000001', { delay: 8 }); await p.press('#codigo', 'Enter'); await p.waitForTimeout(400);
  const atalho = await p.locator('a.cadastrar').count();
  if (atalho !== (PAPEL === 'admin' ? 1 : 0)) console.log('BARRAS atalho de cadastro em Vender:', atalho, 'para', PAPEL);
  await checar('vender-barras-novo'); await p.screenshot({ path: `${OUT}/vender-barras-novo.png` });
  if (PAPEL === 'admin') {
    await p.click('a.cadastrar'); await p.waitForTimeout(800);
    const preenchido = await p.locator('.cb-linha input').first().inputValue();
    if (!p.url().includes('/admin/produtos/novo') || preenchido !== '7890000000001') console.log('BARRAS cadastro não veio preenchido:', p.url(), preenchido);
    await checar('produto-novo-barras'); await p.screenshot({ path: `${OUT}/produto-novo-barras.png`, fullPage: true });
    // Código que já existe em outra variação não é aceito
    await p.goto('http://localhost:4301/admin/produtos/novo?barras=7891234567890'); await p.waitForTimeout(800);
    const repetido = await p.locator('.cb-linha input').first().inputValue();
    if (repetido) console.log('BARRAS código repetido foi aceito no cadastro:', repetido);
    await p.goto('http://localhost:4301/admin/produtos/novo'); await p.waitForTimeout(800);
    const modoBarras = (await p.locator('.cb-linha input').count()) === 1 && (await p.getByText('Número no tipo').count()) === 0;
    await p.click('button:has-text("Sem código (00-00)")'); await p.waitForTimeout(200);
    const modoCodigo = (await p.locator('.cb-linha input').count()) === 0 && (await p.getByText('Número no tipo').count()) === 1;
    if (!modoBarras || !modoCodigo) console.log('MODO cadastro: barras ok =', modoBarras, '· 00-00 ok =', modoCodigo);
    await checar('produto-novo-00-00'); await p.screenshot({ path: `${OUT}/produto-novo-00-00.png`, fullPage: true });
  }
  fs.writeFileSync(`${OUT}/relatorio.json`, JSON.stringify(relatorio, null, 1));
  if (A11Y) {
    fs.writeFileSync(`${OUT}/acessibilidade.json`, JSON.stringify(acesso, null, 1));
    for (const [k, v] of Object.entries(acesso)) if (v.length) console.log('## a11y', k, '\n  ' + v.map((x) => `[${x.impacto}] ${x.regra} · ${x.seletor} · ${x.msg}`).join('\n  '));
  }
  for (const [k, v] of Object.entries(relatorio)) if (v.length) console.log('##', k, '\n  ' + v.join('\n  '));
  await b.close(); srv.close();
})();
