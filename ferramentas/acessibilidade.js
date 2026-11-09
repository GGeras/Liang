// Varredura de acessibilidade (WCAG 2.2) com o @accesslint/core em todas as telas e folhas,
// usando os mesmos dados fictícios da auditoria mobile (não acessa o Supabase).
// Uso:  npm run build && node ferramentas/acessibilidade.js <largura> [pasta] [admin|vendedor]
// Saída: <pasta>/acessibilidade.json e a lista de violações no terminal.
process.env.LIANG_A11Y = '1';
require('./auditoria-mobile.js');
