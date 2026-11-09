-- =====================================================================
-- Liang — Migration 006: endurecimento após simulação de ataques (09/11/2026)
--  1. registrar_venda: valida cada item (quantidade inteira 1..9999,
--     variação em formato uuid), no máximo 100 itens e cliente com até
--     120 caracteres. Antes: "+3" e "-2" do mesmo item viravam 1 unidade,
--     e payloads gigantes viravam ocorrências enormes.
--  2. Venda "offline" só volta o preço até 24 h (antes 7 dias): limita quem
--     marca uma venda como offline com data antiga para pegar preço anterior.
--  3. Id de venda de outro vendedor não responde "duplicada/ok".
--  4. Custo das peças só para admin (vendedor lia variacoes.custo e
--     venda_itens.custo_unitario pela API).
--  5. Permissões mínimas: anon sem acesso a nada em public; tabelas
--     escritas só por função sem INSERT/UPDATE/DELETE para authenticated;
--     perfis só com UPDATE de nome/papel/ativo.
--  6. Sempre sobra ao menos um admin ativo.
-- =====================================================================

-- ---------- 1, 2, 3. registrar_venda ----------
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
  v_dono      uuid;
  -- Venda offline: preço do momento da venda, no máximo 24 h para trás; nunca no futuro
  v_quando    timestamptz := least(greatest(coalesce(p_criada_em, now()), now() - interval '24 hours'), now());
begin
  if not is_ativo() then
    return jsonb_build_object('ok', false, 'erro', 'usuario_inativo');
  end if;
  if p_id is null then
    return jsonb_build_object('ok', false, 'erro', 'venda_sem_id');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));

  select vendedor_id into v_dono from vendas where id = p_id;
  if found then
    if v_dono = v_vendedor then
      return jsonb_build_object('ok', true, 'venda_id', p_id, 'duplicada', true);
    end if;
    return jsonb_build_object('ok', false, 'erro', 'id_em_uso');
  end if;

  if coalesce(trim(p_cliente), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'cliente_obrigatorio');
  end if;
  if length(trim(p_cliente)) > 120 then
    return jsonb_build_object('ok', false, 'erro', 'cliente_invalido');
  end if;
  if p_tipo_preco = 'atacado' and p_pagamento = 'cartao' then
    return jsonb_build_object('ok', false, 'erro', 'cartao_so_varejo');
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'venda_sem_itens');
  end if;
  if jsonb_array_length(p_itens) > 100 then
    return jsonb_build_object('ok', false, 'erro', 'itens_demais');
  end if;
  -- Cada item: objeto com variacao_id (uuid) e quantidade inteira de 1 a 9999
  if exists (
    select 1 from jsonb_array_elements(p_itens) x
     where case
             when jsonb_typeof(x) <> 'object' then true
             when jsonb_typeof(x->'variacao_id') is distinct from 'string' then true
             when (x->>'variacao_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
             when jsonb_typeof(x->'quantidade') is distinct from 'number' then true
             else (x->>'quantidade')::numeric < 1 or (x->>'quantidade')::numeric > 9999
                  or (x->>'quantidade')::numeric <> trunc((x->>'quantidade')::numeric)
           end
  ) then
    return jsonb_build_object('ok', false, 'erro', 'item_invalido');
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
    if not v_item.ativo or not v_item.produto_ativo
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
            jsonb_build_object('venda_id', p_id, 'cliente', trim(p_cliente), 'tipo_preco', p_tipo_preco,
                               'pagamento', p_pagamento, 'criada_em', v_quando,
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

-- ---------- 4. Custo só para admin ----------
revoke select on variacoes from authenticated;
grant select (id, produto_id, nome, preco_atacado, preco_varejo, codigo_barras, estoque_minimo, ativo, criado_em, atualizado_em)
  on variacoes to authenticated;

revoke select on venda_itens from authenticated;
grant select (id, venda_id, variacao_id, quantidade, preco_unitario, subtotal) on venda_itens to authenticated;

create or replace function custos_variacoes(p_produto uuid)
returns table (variacao_id uuid, custo numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Apenas administradores'; end if;
  return query select v.id, v.custo from variacoes v where v.produto_id = p_produto;
end $$;
revoke all on function custos_variacoes(uuid) from public, anon;
grant execute on function custos_variacoes(uuid) to authenticated;

-- ---------- 5. Permissões mínimas ----------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables    from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;

-- Escritas só pelas funções de regra de negócio
revoke insert, update, delete on estoque, vendas, venda_itens, movimentos, ocorrencias, alteracoes_catalogo from authenticated;
revoke insert, delete on perfis from authenticated;
revoke update on perfis from authenticated;
grant update (nome, papel, ativo) on perfis to authenticated;

-- ---------- 6. Ao menos um admin ativo ----------
create or replace function trg_ultimo_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.papel = 'admin' and old.ativo and (new.papel <> 'admin' or not new.ativo)
     and not exists (select 1 from perfis where papel = 'admin' and ativo and id <> old.id) then
    raise exception 'É preciso manter ao menos um administrador ativo';
  end if;
  return new;
end $$;
revoke all on function trg_ultimo_admin() from public, anon, authenticated;

create trigger perfis_ultimo_admin
  before update of papel, ativo on perfis
  for each row execute function trg_ultimo_admin();
