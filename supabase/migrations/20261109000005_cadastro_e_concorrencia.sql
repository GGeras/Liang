-- =====================================================================
-- Liang — Migration 005: correções da análise geral (09/11/2026)
--  1. Cadastro público não cria admin: o papel vem só do app_metadata
--     (gravado pelo servidor). Quem não foi criado pela função `usuarios`
--     nasce vendedor e INATIVO, sem acesso a nada.
--  2. Mesma venda enviada duas vezes ao mesmo tempo não gera recusa falsa
--     nem ocorrência indevida (trava pelo id da venda).
--  3. Estoque nunca negativo também por constraint.
--  4. Desempenho das policies (advisor): auth.uid()/is_admin() avaliados
--     uma vez por consulta e uma policy por ação.
--  5. Índices nas chaves estrangeiras; bucket de fotos com limite.
-- =====================================================================

-- ---------- 1. Novo usuário ----------
create or replace function trg_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_admin boolean := coalesce((new.raw_app_meta_data->>'criado_pelo_admin')::boolean, false);
begin
  insert into perfis (id, nome, papel, ativo)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_app_meta_data->>'nome'), ''), split_part(new.email, '@', 1)),
    case when v_admin then coalesce((new.raw_app_meta_data->>'papel')::papel_usuario, 'vendedor') else 'vendedor' end,
    v_admin
  );
  return new;
end $$;
revoke all on function trg_novo_usuario() from public, anon, authenticated;

-- ---------- 2. registrar_venda com trava por id ----------
create or replace function registrar_venda(
  p_id uuid,
  p_cliente text,
  p_tipo_preco tipo_preco,
  p_pagamento forma_pagamento,
  p_itens jsonb,
  p_criada_em timestamptz default now(),
  p_offline boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item      record;
  v_total     numeric(12,2) := 0;
  v_faltando  jsonb := '[]'::jsonb;
  v_vendedor  uuid := auth.uid();
  v_quando    timestamptz := least(greatest(coalesce(p_criada_em, now()), now() - interval '7 days'), now());
begin
  if not is_ativo() then
    return jsonb_build_object('ok', false, 'erro', 'usuario_inativo');
  end if;
  if p_id is null then
    return jsonb_build_object('ok', false, 'erro', 'venda_sem_id');
  end if;

  -- Duas chamadas com o mesmo id (reenvio, duas abas) entram uma de cada vez;
  -- a segunda encontra a venda pronta e devolve "duplicada".
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));

  if exists (select 1 from vendas where id = p_id) then
    return jsonb_build_object('ok', true, 'venda_id', p_id, 'duplicada', true);
  end if;

  if coalesce(trim(p_cliente), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'cliente_obrigatorio');
  end if;
  if p_tipo_preco = 'atacado' and p_pagamento = 'cartao' then
    return jsonb_build_object('ok', false, 'erro', 'cartao_so_varejo');
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'venda_sem_itens');
  end if;

  for v_item in
    select i.variacao_id, sum(i.quantidade)::int as quantidade,
           v.ativo, p.ativo as produto_ativo,
           p.codigo, p.nome, v.nome as variacao
      from (select (x->>'variacao_id')::uuid as variacao_id, (x->>'quantidade')::int as quantidade
              from jsonb_array_elements(p_itens) x) i
      join variacoes v on v.id = i.variacao_id
      join produtos  p on p.id = v.produto_id
     group by i.variacao_id, v.ativo, p.ativo, p.codigo, p.nome, v.nome
     order by i.variacao_id
  loop
    perform 1 from estoque where variacao_id = v_item.variacao_id for update;
    if v_item.quantidade <= 0 or not v_item.ativo or not v_item.produto_ativo
       or (select quantidade from estoque where variacao_id = v_item.variacao_id) < v_item.quantidade then
      v_faltando := v_faltando || jsonb_build_object(
        'variacao_id', v_item.variacao_id, 'codigo', v_item.codigo,
        'produto', v_item.nome, 'variacao', v_item.variacao,
        'pedido', v_item.quantidade,
        'disponivel', (select quantidade from estoque where variacao_id = v_item.variacao_id));
    end if;
  end loop;

  if (select count(distinct (x->>'variacao_id'))
        from jsonb_array_elements(p_itens) x
        join variacoes v on v.id = (x->>'variacao_id')::uuid)
     <> (select count(distinct (x->>'variacao_id')) from jsonb_array_elements(p_itens) x) then
    v_faltando := v_faltando || jsonb_build_object('erro', 'item_inexistente');
  end if;

  if jsonb_array_length(v_faltando) > 0 then
    insert into ocorrencias (tipo, mensagem, dados, usuario_id)
    values ('venda_sem_estoque',
            'Venda recusada por falta de estoque' || case when p_offline then ' (registrada offline)' else '' end,
            jsonb_build_object('venda_id', p_id, 'cliente', p_cliente, 'tipo_preco', p_tipo_preco,
                               'pagamento', p_pagamento, 'criada_em', p_criada_em,
                               'itens', p_itens, 'faltando', v_faltando),
            v_vendedor);
    return jsonb_build_object('ok', false, 'erro', 'sem_estoque', 'faltando', v_faltando);
  end if;

  insert into vendas (id, cliente_nome, tipo_preco, forma_pagamento, total, vendedor_id, criada_em, offline)
  values (p_id, trim(p_cliente), p_tipo_preco, p_pagamento, 0, v_vendedor, v_quando, p_offline);

  insert into venda_itens (venda_id, variacao_id, quantidade, preco_unitario, custo_unitario)
  select p_id, v.id, i.quantidade,
         case when p_offline then preco_em(v.id, p_tipo_preco, v_quando)
              when p_tipo_preco = 'atacado' then v.preco_atacado else v.preco_varejo end,
         v.custo
    from (select (x->>'variacao_id')::uuid as variacao_id, sum((x->>'quantidade')::int)::int as quantidade
            from jsonb_array_elements(p_itens) x group by 1) i
    join variacoes v on v.id = i.variacao_id;

  for v_item in select variacao_id, quantidade from venda_itens where venda_id = p_id loop
    perform _movimentar(v_item.variacao_id, -v_item.quantidade, 'venda', p_id);
  end loop;

  select sum(subtotal) into v_total from venda_itens where venda_id = p_id;
  update vendas set total = v_total where id = p_id;

  return jsonb_build_object('ok', true, 'venda_id', p_id, 'total', v_total);
end $$;

revoke all on function registrar_venda(uuid, text, tipo_preco, forma_pagamento, jsonb, timestamptz, boolean) from public, anon;
grant execute on function registrar_venda(uuid, text, tipo_preco, forma_pagamento, jsonb, timestamptz, boolean) to authenticated;

-- ---------- 3. Estoque nunca negativo ----------
alter table estoque add constraint estoque_nao_negativo check (quantidade >= 0);

-- ---------- 4. Policies: uma avaliação por consulta, uma policy por ação ----------
drop policy perfis_select       on perfis;
drop policy perfis_admin_update on perfis;
create policy perfis_select on perfis for select to authenticated
  using (id = (select auth.uid()) or (select is_admin()));
create policy perfis_admin_update on perfis for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));

do $$
declare t text;
begin
  foreach t in array array['tipos', 'produtos', 'variacoes', 'compatibilidades'] loop
    execute format('drop policy if exists %s_admin on %I', case t when 'compatibilidades' then 'compat' else t end, t);
    execute format('create policy %1$s_admin_insert on %2$I for insert to authenticated with check ((select is_admin()))', t, t);
    execute format('create policy %1$s_admin_update on %2$I for update to authenticated using ((select is_admin())) with check ((select is_admin()))', t, t);
    execute format('create policy %1$s_admin_delete on %2$I for delete to authenticated using ((select is_admin()))', t, t);
  end loop;
end $$;

drop policy tipos_select     on tipos;
drop policy produtos_select  on produtos;
drop policy variacoes_select on variacoes;
drop policy compat_select    on compatibilidades;
create policy tipos_select     on tipos     for select to authenticated using ((select is_ativo()));
create policy produtos_select  on produtos  for select to authenticated using ((select is_ativo()));
create policy variacoes_select on variacoes for select to authenticated using ((select is_ativo()));
-- Vendedor só vê compatibilidades confirmadas (regra 3)
create policy compat_select on compatibilidades for select to authenticated
  using ((select is_admin()) or ((select is_ativo()) and status = 'confirmada'));

drop policy estoque_select      on estoque;
drop policy vendas_select       on vendas;
drop policy venda_itens_select  on venda_itens;
drop policy movimentos_select   on movimentos;
drop policy ocorrencias_select  on ocorrencias;
drop policy alteracoes_select   on alteracoes_catalogo;
create policy estoque_select on estoque for select to authenticated using ((select is_ativo()));
create policy vendas_select on vendas for select to authenticated
  using (vendedor_id = (select auth.uid()) or (select is_admin()));
create policy venda_itens_select on venda_itens for select to authenticated
  using (exists (select 1 from vendas v where v.id = venda_id and (v.vendedor_id = (select auth.uid()) or (select is_admin()))));
create policy movimentos_select   on movimentos          for select to authenticated using ((select is_admin()));
create policy ocorrencias_select  on ocorrencias         for select to authenticated using ((select is_admin()));
create policy alteracoes_select   on alteracoes_catalogo for select to authenticated using ((select is_admin()));

-- ---------- 5. Índices e fotos ----------
create index if not exists alteracoes_usuario_idx      on alteracoes_catalogo (usuario_id);
create index if not exists compat_criado_por_idx       on compatibilidades (criado_por);
create index if not exists movimentos_usuario_idx      on movimentos (usuario_id);
create index if not exists movimentos_venda_idx        on movimentos (venda_id);
create index if not exists ocorrencias_resolvida_por_idx on ocorrencias (resolvida_por);
create index if not exists ocorrencias_usuario_idx     on ocorrencias (usuario_id);
create index if not exists venda_itens_variacao_idx    on venda_itens (variacao_id);
create index if not exists vendas_cancelada_por_idx    on vendas (cancelada_por);

-- A API nunca usa TRUNCATE/TRIGGER/REFERENCES: tira a superfície
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'produtos';
