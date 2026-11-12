# Liang · Estoque Mundo Mix

PWA mobile de controle de estoque de peças de celular (telas, tampas, conectores, baterias) da Mundo Mix, loja única. Usado no balcão, no celular, por vendedores e administradores. Interface e textos em português do Brasil.

## Stack e ambientes
- Angular 20: standalone, signals, zoneless, `@if/@for`, componentes com template e estilos inline em `src/app/features/**`.
- Supabase, projeto **Liang**, ref `irfgrdaoblycskbngqnh`, região `sa-east-1`. A chave publicável está em `src/environments/environment.ts` e pode ficar no front: quem garante a segurança é a RLS.
- Hospedagem no Cloudflare Workers (static assets), projeto `liang`, endereço `https://liang.jg8598917.workers.dev`. Build `npm run build`, deploy `npx wrangler deploy` (automático a cada push no `main`). A configuração está em `wrangler.jsonc` (pasta `dist/liang/browser`, modo SPA); `public/_headers` traz a CSP. Não existe `_redirects`: o modo SPA do Worker já serve o app em todas as rotas.
- Banco: migrations em `supabase/migrations/` (numeradas, nunca editar uma já aplicada; criar uma nova). Edge function `usuarios` em `supabase/functions/usuarios`.

## Regras de negócio (definidas com o dono; não mudar sem perguntar)
1. **Identificação: código de barras OU `00-00`, nunca os dois** (decisão do dono, 09/11/2026). A maioria das peças tem código de barras: cadastra-se lendo o código e completando o resto, sem `00-00`. O `00-00` existe só para peças **sem** código de barras: os 2 primeiros dígitos são o tipo e os 2 últimos o produto dentro do tipo; o admin define o número (o app sugere o próximo livre). Um tipo pode precisar de um segundo número quando passar de 100 produtos `00-00`. O tipo (categoria) é obrigatório nos dois casos. O banco garante a regra (`checar_identificacao`, no fim da transação).
2. **Variação:** cor ou qualidade (Incell, OLED, JK…) é variação do mesmo produto. Cada variação tem preço de atacado, preço de varejo, custo opcional, estoque mínimo e estoque próprio. Em produto com código de barras, **cada variação tem o seu código** (obrigatório); em produto `00-00`, nenhuma variação tem código de barras.
3. **Compatibilidades:** só o admin cadastra. O status é `confirmada` ou `a_confirmar`, e o vendedor vê só as confirmadas. Sugestões automáticas sempre entram como `a_confirmar`.
4. **Venda:** sempre é venda (não há troca nem uso interno).
   - Pode ter vários itens e um único tipo de preço (atacado ou varejo). O vendedor não altera preço.
   - Guarda o nome do cliente (sem cadastro), o vendedor, a forma de pagamento, a data e a hora.
   - Cartão só é aceito no varejo. Atacado aceita só dinheiro ou Pix.
   - O vendedor confirma a venda antes de enviar.
5. **Leitura de produto:** pelo código de barras (câmera ou leitor USB/Bluetooth) ou, para peça sem código de barras, pelo `00-00`. Só é possível vender produto cadastrado e com estoque suficiente para a quantidade.
6. **Offline:** a venda fica numa fila criptografada no aparelho (AES-GCM, chave não exportável; ver `core/cofre.ts`). Ao reconectar, o servidor decide: quem chega primeiro leva o estoque. A venda recusada vira **ocorrência** para o admin, e o vendedor é avisado. A venda offline usa o preço vigente na hora da venda (`preco_em`), no máximo 24 h para trás.
7. **Cancelamento:** só o admin cancela, com motivo, e escolhe se o estoque volta.
8. **Entrada:** registra quem, quando e quantos; o custo é opcional e, quando informado, atualiza o custo da variação.
9. **Ajuste de inventário:** só o admin, com motivo obrigatório.
10. **Referência absoluta:** o sistema é a fonte da verdade. O histórico é imutável: `movimentos`, `venda_itens` e `alteracoes_catalogo` bloqueiam UPDATE e DELETE. O estoque só muda pelas funções `registrar_venda`, `registrar_entrada`, `ajustar_estoque` e `cancelar_venda`, que validam o perfil por dentro (os avisos do linter sobre SECURITY DEFINER nelas são esperados, assim como em `salvar_produto`, `custos_variacoes`, `dashboard_resumo`, `resolver_ocorrencia`, `is_admin` e `is_ativo`).
11. **Perfis:** admin (pode haver vários) e vendedor. O vendedor vê o estoque e o próprio histórico. O admin tem painel, estoque, produtos, vendas, movimentações, ocorrências e usuários.
12. **Usuários:** só o admin cria usuários, pela edge function `usuarios`. São no máximo 2 a 3 vendedores ao mesmo tempo.

## Convenções de interface
- Público: equipe da loja, uso rápido de pé no balcão, com uma mão. Meta de acessibilidade WCAG 2.2 **AA**. Preços e códigos precisam ser legíveis de relance.
- Tokens de cor e tipo em `src/styles.scss`: papel `#EEF1F4`, tinta `#172130`, cobalto `#2340C8`, etiqueta amarela `#FFD447`, fonte Archivo com eixo de largura. A **etiqueta amarela com o código `00-00`** é o elemento de identidade; não diluir: produto com código de barras mostra o código num selo neutro (`app-ident` / `.barras-id`), nunca na etiqueta amarela.
- Classes de texto:
  - `.clamp-2`: nome de produto em até 2 linhas.
  - `.uma-linha`: metadado de uma linha, com reticências.
  - `.num`: valores e códigos, que nunca quebram.
  - `.rolagem-x`: linha de chips de filtro.
  - `.rotulo-opcional`: texto de botão que some abaixo de 360px.
- Grids com coluna flexível usam `minmax(0, 1fr)` para não estourar com nomes longos.
- Toda tela deve funcionar em 320, 360 e 412px sem rolagem horizontal.
- **Idiomas:** PT-BR (padrão) e mandarim (`zh-CN`), escolhidos em Entrar, Mais, Minhas vendas e /instalar (`app-idioma`). As telas continuam escritas em português; `core/idioma.service.ts` troca os textos na tela pelo dicionário `core/idioma.zh.ts` (textos fixos e modelos com `{}`). Texto novo: acrescente a tradução lá. Dados do cadastro (produtos, clientes) não são traduzidos; use `translate="no"` para proteger um trecho. `LIANG_ZH=1 node ferramentas/auditoria-mobile.js 360 .auditoria/zh admin` lista o que ficou em português (`TRADUZIR`).
- **Notinha (térmica 80 mm, Epson TM-T20):** `app-notinha` + `src/_notinha.scss` servem à simulação e ao papel; não criar CSS só de tela para o conteúdo da notinha. Só preto puro, 72 mm de conteúdo, sempre em português (`translate="no"`). Dados da loja na tabela `loja` (Mais › Dados da loja), em cache no aparelho; o QR do WhatsApp sai do telefone da loja (celular com DDD). Não acrescentar elementos sem necessidade: a notinha deve ficar curta. Conferir papel × simulação com `node ferramentas/notinha-pdf.js`. PC do balcão: `docs/impressora-balcao.md`.
- **Ajuda (?):** `app-ajuda` (`shared/ajuda.ts`) explica em uma frase um campo ou bloco que o rótulo sozinho não deixa claro. Usar pouco (hoje: custo, estoque mínimo, número no tipo, quantidade do ajuste, devolver estoque, perfil, acesso ativo, lucro estimado, vendas aguardando envio). Nunca dentro de `<label>`: usar `.rotulo-ajuda` com `<label for>` ao lado.
- **Rascunhos:** o que está em andamento (carrinho da venda, cadastro de produto, dados da loja) fica guardado no cofre do aparelho por usuário, por 24 h, e volta se o app recarregar (`core/rascunho.service.ts`, `vincular`). Formulário novo com trabalho que não pode se perder usa o mesmo serviço e mostra `app-aviso-rascunho`. Nunca guardar senha em rascunho.
- **Verificação:** `npm run auditoria` (requer `npx playwright install chromium` uma vez). Gera capturas em `.auditoria/` com dados fictícios e nomes longos, e lista elementos que estouram a tela. Olhar as capturas, não só a saída.

## Commits
Mensagens em português, descrevendo o que mudou para o usuário.

## Segurança (não desfazer)
- Papel e acesso vêm do `app_metadata` (só a edge function `usuarios` grava). Usuário criado por outro caminho nasce vendedor inativo.
- `anon` não tem acesso a nada em `public`. Tabelas de histórico e estoque não têm INSERT/UPDATE/DELETE para `authenticated`; tudo passa pelas funções.
- O custo (`variacoes.custo`, `venda_itens.custo_unitario`) não é legível pelo `authenticated`: o admin lê por `custos_variacoes` e grava produto por `salvar_produto`. Nunca usar `select('*')` em `variacoes`.
- CSP em `public/_headers`; a auditoria aplica a mesma CSP e acusa bloqueios (`CSP` na saída).
