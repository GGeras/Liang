# Análise geral do Liang · 09/11/2026

Escopo: regras de negócio × banco × front, banco (Supabase `irfgrdaoblycskbngqnh`), integração, front/PWA, layout mobile (320/360/412) e acessibilidade (AccessLint, admin e vendedor).
Estado do banco na análise: 5 migrations aplicadas, **nenhum dado** (0 usuários, 0 produtos).

Legenda: **C** crítico · **A** alto · **M** médio · **B** baixo · ❓ muda regra de negócio (precisa de resposta).

---

## 1. Regras de negócio (CLAUDE.md × banco × front)

| # | Grav. | Achado | Onde | Correção |
|---|---|---|---|---|
| 1.1 | **C** | **Qualquer pessoa vira admin.** O cadastro público do Auth está aberto (`disable_signup: false`) e o trigger lê o `papel` do `user_metadata`, que quem se cadastra controla. Basta chamar `/auth/v1/signup` com `{"papel":"admin"}` usando a chave publicável (que está no front). Quebra a regra 12. | `supabase/migrations/20261108000001_base.sql:36-46` | Trigger passa a ler o papel do `app_metadata` (só o servidor grava) e cria todo usuário **inativo** se não veio da função `usuarios`. Edge function grava em `app_metadata`. Recomendo também desligar *Allow new users to sign up* no painel (Auth › Providers › Email). |
| 1.2 | **C** | **Venda offline some sem registro.** Na sincronização, qualquer erro que não seja de rede (token vencido, 401, 500, timeout do PostgREST) faz a venda sair da fila com um aviso local. A venda não entra no banco, o estoque não baixa e o admin não recebe ocorrência. Quebra as regras 6 e 10. | `src/app/core/vendas.service.ts:132-144` | Só tirar da fila quando o servidor **respondeu** (ok ou recusa da função). Erro técnico mantém a venda na fila e tenta de novo. |
| 1.3 | **A** | Envio duplicado da mesma venda ao mesmo tempo (duas abas, `online` + timer) pode **recusar uma venda que foi registrada**: a 2ª chamada espera a trava, vê o estoque já baixado, cria ocorrência falsa e o vendedor é avisado de recusa. | `supabase/migrations/20261109000004_auditoria_precos.sql:92-94` | Trava por `id` da venda (`pg_advisory_xact_lock`) antes do teste de idempotência. |
| 1.4 | **A** | Carrinho, avisos e fila são do aparelho, não do usuário: o vendedor B vê o carrinho e os avisos de recusa do A; a faixa “Enviando N vendas” mostra vendas do A para sempre. | `vender.ts:19-31`, `vendas.service.ts:59-60,127-131` | Limpar carrinho ao sair; filtrar fila/avisos pelo usuário logado. |
| 1.5 | ❓ M | Venda marcada como offline usa o preço de até **7 dias atrás** com a data que o aparelho informa. Um vendedor pode enviar `p_offline=true` com data antiga e pegar o preço anterior a um aumento. | `20261109000004_auditoria_precos.sql:86,151` | Opções: (a) aceitar; (b) reduzir a janela (ex.: 24 h); (c) limitar à hora da última sincronização do catálogo no aparelho. **Pergunta 1.** |
| 1.6 | ❓ M | O vendedor consegue ler o **custo** das variações (`variacoes.custo`) e dos itens das próprias vendas pela API, mesmo sem tela para isso. | RLS `variacoes_select` em `base.sql:239`; `venda_itens.custo_unitario` | Mover custo para tabela só de admin ou expor só por função. **Pergunta 2.** |
| 1.7 | M | Venda **online** recusada também vira ocorrência (a regra fala só da offline). Gera ruído para o admin. | `20261109000004_auditoria_precos.sql:135-143` | Criar ocorrência só quando `p_offline`. ❓ **Pergunta 3.** |
| 1.8 | B | O banco deixa o admin rebaixar a si mesmo e ficar sem nenhum admin ativo (a tela bloqueia, o banco não). | `base.sql:229` | Trigger que impede remover o último admin ativo. |
| — | ok | Vendedor não altera preço (servidor usa o catálogo), cartão só no varejo (constraint + função), estoque suficiente com trava `FOR UPDATE` em ordem fixa, histórico imutável (`movimentos`, `venda_itens`, `alteracoes_catalogo`), cancelamento/entrada/ajuste só admin com motivo, compatibilidade “a confirmar” invisível ao vendedor (RLS + view). | | |

## 2. Banco de dados

| # | Grav. | Achado | Onde | Correção |
|---|---|---|---|---|
| 2.1 | M | Sem `CHECK (quantidade >= 0)` em `estoque`: a regra depende só das funções. | `base.sql:110-114` | Constraint. |
| 2.2 | M | Advisor de desempenho: `auth.uid()`/`is_admin()` reavaliados por linha (3 policies) e políticas permissivas duplicadas em SELECT (4 tabelas). | policies de `base.sql:227-259` | `(select auth.uid())`, `(select is_admin())`; separar `*_admin` em insert/update/delete. |
| 2.3 | B | 8 chaves estrangeiras sem índice (`movimentos.venda_id`, `venda_itens.variacao_id`, …). | advisor | Índices. |
| 2.4 | B | Bucket `produtos` público, sem limite de tamanho nem tipo de arquivo. Fotos não apagadas ao trocar/remover. | `20261108000002_funcoes.sql:275` | `file_size_limit` 2 MB e `image/*`. |
| 2.5 | B | `anon`/`authenticated` têm `TRUNCATE`/`TRIGGER`/`REFERENCES` em todas as tabelas (padrão do Supabase). A API não expõe, mas é superfície desnecessária. | grants | `revoke truncate, trigger, references`. |
| 2.6 | B | Migrations locais e remotas com nomes/versões diferentes (remoto tem `base` vazia + `estrutura_base`). | `supabase/migrations/` × `schema_migrations` | Alinhar ao usar a CLI. |
| — | ok | Advisor de segurança: só os 8 avisos de SECURITY DEFINER esperados (regra 10). Idempotência pelo `id` gerado no aparelho. Funções internas (`_movimentar`, `preco_em`, triggers) sem EXECUTE para `authenticated`. | | |

## 3. Integração com o Supabase

| # | Grav. | Achado | Onde | Correção |
|---|---|---|---|---|
| 3.1 | M | Usuário desativado: `atualizarPerfil` lança erro dentro da inicialização, a promessa dos guards rejeita e a navegação quebra (tela em branco). | `core/auth.service.ts:24-46` | Tratar o erro e mandar para `/entrar` com a mensagem. |
| 3.2 | M | Sessão inválida (refresh token revogado) com perfil em cache: o app parece logado, mas todas as chamadas falham. | `core/auth.service.ts:33-39` | Se a busca do perfil voltar 401/JWT, sair. |
| 3.3 | M | Carrinho guarda preço e estoque do momento em que o item entrou. Se o catálogo atualizar, a tela de confirmação mostra o total antigo; o servidor cobra o atual. | `vender.ts:282` | Recalcular o carrinho a partir do catálogo atual. |
| 3.4 | M | Salvar produto é feito em 3–4 requisições separadas (produto, variações, exclusões, compatibilidades). Uma falha no meio deixa o cadastro pela metade. | `admin/produto-form.ts:365-427` | Função `salvar_produto(jsonb)` numa transação. |
| 3.5 | M | Sem tipos gerados do banco: respostas tratadas com `as unknown as …`. | `minhas-vendas.ts:123`, `ocorrencias.ts:98`, … | Gerar `database.types.ts` e tipar o client. |
| 3.6 | B | Erros de `usuarios.carregar`, `estoque.carregarMovs` e `vendas` (lista de vendedores) são ignorados em silêncio. | `usuarios.ts:103`, `estoque.ts:215`, `vendas.ts:119` | Mostrar erro. |
| — | ok | Paginação com `range` (catálogo em blocos de 1000, vendas 30), joins nomeados por FK, `rpc` para tudo que muda estoque. | | |

## 4. Sistema / front

| # | Grav. | Achado | Onde | Correção |
|---|---|---|---|---|
| 4.1 | M | PWA sem tratamento de nova versão (`SwUpdate`): a versão nova só entra quando o app é fechado de vez; nenhum aviso. | `app.config.ts:16-19` | Ouvir `VERSION_READY` e recarregar quando não houver carrinho/fila. |
| 4.2 | B | Ícone `maskable` é o mesmo arquivo do `any` (corta nas bordas no Android). | `public/manifest.webmanifest` | Ícone com área de segurança. |
| 4.3 | B | Sem CSP nem `frame-ancestors` em `_headers`. | `public/_headers` | Adicionar. |
| 4.4 | B | Bundle inicial 487 kB (125 kB transferidos), dominado pelo `supabase-js`. Aceitável para PWA em cache. | build | — |
| — | ok | Angular 20 standalone, signals e zoneless em todo o app; rotas lazy; fila AES-GCM com chave não exportável. | | |

## 5. Layout mobile (`npm run auditoria`, 320/360/412 + vendedor)

Nenhum estouro horizontal. O único aviso (`CORTADO .rotulo-opcional` em 320) é proposital.

| # | Grav. | Achado | Onde | Correção |
|---|---|---|---|---|
| 5.1 | M | Alvos de toque abaixo de 44 px: chips (36), `.btn.pequeno` (36), selos de status de compatibilidade, link “Ver estoque”. Passam no mínimo AA (24 px), mas não na meta do projeto. | `styles.scss:122,217`, `produto-form.ts:142`, `painel.ts:163` | `min-height: 44px`. |
| 5.2 | B | Foco dos campos é só a borda de 1,5 px mudando de cor (`outline: none`). | `styles.scss:276-282` | Anel de foco de 3 px. |
| 5.3 | B | Filtro “Todos vendedores” cortado em 320 px. | `admin/vendas.ts:17` | Texto “Vendedor: todos” ou coluna única. |

## 6. Acessibilidade (AccessLint 0.21, WCAG 2.2 AA, admin e vendedor em 360 px)

| # | Grav. | Achado | Onde | Correção |
|---|---|---|---|---|
| 6.1 | **A** | Contraste: texto cinza nos seletores segmentados (`--muted` sobre `--line` = 4,18:1) em Vender, Finalizar, Ocorrências e Usuários. | `styles.scss:300` | Escurecer `--muted` para `#4f5a69` (5,0:1 sobre `--line`). |
| 6.2 | **A** | Contraste: selo verde `--ok` sobre `--ok-bg` = 4,31:1 (“Administrador”, “Confirmada”). | `styles.scss:16-17` | `--ok: #146c41` (5,6:1). |
| 6.3 | **A** | Contraste: itens esmaecidos com `opacity` (variação sem estoque no catálogo, produto inativo, venda cancelada, usuário desativado) caem para 2,2–3,7:1. | `catalogo.ts:123`, `produtos.ts:107`, `vendas.ts:91`, `minhas-vendas.ts:89`, `usuarios.ts:72`, `produto-form.ts:191` | Trocar `opacity` por cor `--muted` + selo de estado. |
| 6.4 | **A** | 6 folhas (`<dialog>`) sem nome acessível. | `vender.ts:121,145`, `catalogo.ts:76`, `estoque.ts:62`, `vendas.ts:67`, `usuarios.ts:39`, `produtos.ts:80` | `aria-labelledby` no título. |
| 6.5 | **A** | Abas da folha de estoque com `role="tab"` + `aria-pressed` (combinação inválida). | `admin/estoque.ts:75-78` | `role="group"` + `aria-pressed`, como nos outros seletores. |
| 6.6 | **A** | Campos de observação da compatibilidade só com placeholder. | `admin/produto-form.ts:147` | `aria-label`. |
| 6.7 | M | Gráfico do painel: 30 barras com `tabindex="0"` dentro de `role="img"` (30 paradas de Tab sem papel). | `admin/painel.ts:106-108` | Tirar do Tab, manter o resumo no `role="img"` e uma tabela só para leitor de tela. |
| 6.8 | M | Toast inserido junto com a região `aria-live`: leitores de tela costumam não anunciar. | `app.ts:10-11` | Região viva fixa, só o texto muda. |
| 6.9 | B | `noscript` fora de landmark (falso positivo prático). | `index.html:19` | — |
| ○ | — | Precisa de teste humano: leitura com TalkBack no fluxo Vender → Finalizar → Confirmar; zoom 200 %; uso com leitor de código de barras físico. | | |

---

## Perguntas (mudam regra de negócio)
1. **Preço da venda offline (1.5):** manter a janela de 7 dias, reduzir, ou limitar à última sincronização do aparelho?
2. **Custo (1.6):** o vendedor pode ver o custo das peças? Se não, escondo pelo banco.
3. **Ocorrência de venda online recusada (1.7):** manter ou só para vendas offline?

## O que foi corrigido nesta rodada
- **Banco** (migration `20261109000005_cadastro_e_concorrencia.sql`, aplicada): 1.1 (papel só pelo `app_metadata`, cadastro externo nasce inativo), 1.3 (trava por id da venda), 2.1 (estoque ≥ 0), 2.2 (policies), 2.3 (índices), 2.4 (limite do bucket), 2.5 (grants).
- **Edge function `usuarios`** (v2 publicada): grava papel e nome em `app_metadata`.
- **Front:** 1.2 (fila só descarta venda com resposta do servidor; erro técnico fica na fila e aparece em “Aguardando envio”), 1.4 (carrinho, fila e avisos por usuário), 3.1/3.2 (desativado ou sessão vencida volta ao login com aviso), 3.3 (carrinho acompanha o catálogo), 5.1 parcial (chips, `.btn.pequeno`, “Ver estoque” com 44 px; selos de compatibilidade ainda menores), 5.2, 6.1–6.8.
- **Ferramentas:** `npm run acessibilidade` (AccessLint nas telas com dados fictícios, admin e vendedor).

## Verificação depois das correções
- Testes no banco (em transação desfeita): cadastro público → vendedor inativo, sem ver produtos nem vender; vendedor não altera preço, não ajusta, não cancela, não apaga histórico, não vê compatibilidade “a confirmar”; venda repetida devolve `duplicada`; cartão no atacado recusado; estoque insuficiente recusado.
- `npm run auditoria` 320/360/412/vendedor: sem estouros.
- AccessLint admin e vendedor: 0 violações (fora `noscript`, 6.9).
- Advisors: segurança só com os 8 avisos esperados de SECURITY DEFINER; desempenho só “índice não usado” (banco vazio).
- Não testado: criação real de usuário pela tela (depende do Auth gravar o `app_metadata` no mesmo insert; se não gravar, o usuário nasce inativo e o admin ativa em Usuários), uso no celular com TalkBack, atualização do service worker.

## Ainda em aberto (médio/baixo, sem regra de negócio)
3.4 salvar produto numa transação · 3.5 tipos gerados do banco · 4.1 aviso de nova versão do PWA · 4.2 ícone maskable · 4.3 CSP · 1.8 último admin · 2.6 alinhar migrations · selos de compatibilidade com 44 px.
