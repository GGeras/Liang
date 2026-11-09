# Liang · Estoque Mundo Mix

PWA mobile para controle de estoque de peças de celular (telas, tampas, conectores…) com perfis **administrador** e **vendedor**.

## Stack
- **Front:** Angular 20 (standalone, signals, zoneless) como PWA instalável
- **Banco/Auth/Fotos:** Supabase (projeto `Liang`, região São Paulo)
- **Hospedagem:** Cloudflare Workers (static assets) · https://liang.jg8598917.workers.dev

## Regras principais
| Regra | Onde é garantida |
|---|---|
| Código `00-00` (tipo-produto), gerado de `tipo_id` + `seq` | coluna gerada em `produtos` |
| Variação (cor/qualidade) tem preço atacado/varejo e estoque próprios | `variacoes` + `estoque` |
| Histórico imutável (entrada, venda, ajuste, cancelamento) | `movimentos` com trigger que bloqueia UPDATE/DELETE |
| Estoque só muda por função (`registrar_venda`, `registrar_entrada`, `ajustar_estoque`, `cancelar_venda`) | RLS sem escrita direta |
| Vendedor não altera preço: o servidor usa o preço do catálogo | `registrar_venda` |
| Cartão só no varejo | constraint `cartao_so_varejo` |
| Compatibilidade "a confirmar" não aparece para o vendedor | policy `compat_select` |
| Venda offline: fila criptografada (AES-GCM, chave não exportável) no aparelho; ao conectar, quem chega primeiro leva o estoque; a recusada vira **ocorrência** para o admin | `src/app/core/cofre.ts`, `vendas.service.ts` |
| Cancelamento só admin, com motivo e opção de devolver estoque | `cancelar_venda` |
| Toda alteração de catálogo (preço, nome, compatibilidade, tipo) fica registrada com autor, antes e depois | `alteracoes_catalogo` + triggers |
| Venda offline usa o preço vigente na hora da venda, mesmo que o preço mude antes de sincronizar (até 24 h para trás; antes disso vale o preço de 24 h atrás) | `preco_em()` em `registrar_venda` |
| Entrada com custo atualiza o custo da variação (lucro estimado do painel) | `registrar_entrada` |

## Layout mobile
Testado em 320, 360 e 412 px com nomes longos, sem rolagem horizontal. Convenções em `src/styles.scss`:
- `.clamp-2` nomes de produto em até 2 linhas; `.uma-linha` para metadados com reticências
- `.num` valores e códigos nunca quebram; `.rolagem-x` para filtros em chips
- Botões com `.rotulo-opcional` viram só ícone abaixo de 360 px

## Estrutura
```
supabase/migrations/   SQL do banco (aplicado no projeto Liang)
supabase/functions/    Edge function `usuarios` (criar usuário / trocar senha)
src/app/core/          Supabase, auth, catálogo offline, fila de vendas, cofre criptografado
src/app/features/      Telas: vender, catálogo, minhas vendas, admin (painel, estoque, produtos, vendas, movimentações, ocorrências, usuários)
```

## Rodar local
```bash
npm install
npm start          # http://localhost:4200
npm run build      # saída em dist/liang/browser
```

## Deploy no Cloudflare (Workers)
Worker `liang` ligado ao GitHub (Workers & Pages › liang › Settings › Build):
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy` (branch `main`); outras branches geram link de prévia
- Root directory: `/`

A configuração fica em `wrangler.jsonc`: pasta `dist/liang/browser` e modo SPA (as rotas do app devolvem o `index.html`).
`public/_headers` traz a CSP, os cabeçalhos de segurança e evita cache do service worker.
Endereço: https://liang.jg8598917.workers.dev

## Primeiro administrador
Crie o usuário em Supabase → Authentication → Add user (marque *Auto Confirm*), depois rode no SQL Editor:
```sql
update perfis set papel = 'admin', ativo = true, nome = 'Seu nome' where id = (select id from auth.users where email = 'seu@email.com');
```
Os próximos usuários são criados pelo próprio app em **Mais › Usuários** (edge function `usuarios`, que grava o papel em `app_metadata`).
Qualquer usuário criado por outro caminho (cadastro público, painel do Supabase) nasce **vendedor inativo** e não acessa nada até um admin ativá-lo.
Recomendado: Supabase › Authentication › Sign In / Providers › Email › desligar **Allow new users to sign up**.
