-- =====================================================================
-- Liang — Migration 004: o sistema como referência absoluta
--  1. Toda alteração de catálogo (preço, nome, compatibilidade, tipo)
--     fica registrada: quem, quando, antes e depois.
--  2. Venda feita offline usa o preço vigente no momento da venda,
--     mesmo que o admin tenha mudado o preço antes da sincronização.
--  3. Entrada com custo atualiza o custo da variação (lucro estimado).
-- =====================================================================

create table alteracoes_catalogo (
  id          bigint generated always as identity primary key,
  tabela      text not null,
  registro_id text not null,
  acao        text not null check (acao in ('criado', 'alterado', 'removido')),
  antes       jsonb,
  depois      jsonb,
  usuario_id  uuid references perfis(id),
  criado_em   timestamptz not null default now()
);
create index alteracoes_registro_idx on alteracoes_catalogo (tabela, registro_id, criado_em desc);

alter table alteracoes_catalogo enable row level security;
create policy alteracoes_select on alteracoes_catalogo for select to authenticated using (is_admin());

create trigger alteracoes_imutaveis
  before update or delete on alteracoes_catalogo
  for each row execute function trg_bloqueia_alteracao();

create or replace function trg_auditar_catalogo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_antes  jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'atualizado_em' end;
  v_depois jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'atualizado_em' end;
begin
  if tg_op = 'UPDATE' and v_antes = v_depois then return new; end if;
  insert into alteracoes_catalogo (tabela, registro_id, acao, antes, depois, usuario_id)
  values (tg_table_name,
          coalesce(v_depois->>'id', v_antes->>'id'),
          case tg_op when 'INSERT' then 'criado' when 'UPDATE' then 'alterado' else 'removido' end,
          v_antes, v_depois,
          (select id from perfis where id = auth.uid()));
  return coalesce(new, old);
end $$;
revoke all on function trg_auditar_catalogo() from public, anon, authenticated;

create trigger auditar_tipos            after insert or update or delete on tipos            for each row execute function trg_auditar_catalogo();
create trigger auditar_produtos         after insert or update or delete on produtos         for each row execute function trg_auditar_catalogo();
create trigger auditar_variacoes        after insert or update or delete on variacoes        for each row execute function trg_auditar_catalogo();
create trigger auditar_compatibilidades after insert or update or delete on compatibilidades for each row execute function trg_auditar_catalogo();

-- Preço de uma variação num instante: se houve mudança depois de p_em,
-- o "antes" da primeira mudança é o preço vigente; senão, o atual.
create or replace function preco_em(p_variacao uuid, p_tipo tipo_preco, p_em timestamptz) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (a.antes->>case when p_tipo = 'atacado' then 'preco_atacado' else 'preco_varejo' end)::numeric
       from alteracoes_catalogo a
      where a.tabela = 'variacoes' and a.registro_id = p_variacao::text and a.acao = 'alterado'
        and a.criado_em > p_em
        and a.antes->>case when p_tipo = 'atacado' then 'preco_atacado' else 'preco_varejo' end
            is distinct from a.depois->>case when p_tipo = 'atacado' then 'preco_atacado' else 'preco_varejo' end
      order by a.criado_em
      limit 1),
    (select case when p_tipo = 'atacado' then preco_atacado else preco_varejo end from variacoes where id = p_variacao)
  );
$$;
revoke all on function preco_em(uuid, tipo_preco, timestamptz) from public, anon, authenticated;

-- registrar_venda: igual à 002, mas o preço vem de preco_em() para vendas offline.
-- A data do aparelho só vale até 7 dias para trás e nunca no futuro.
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

-- Entrada com custo atualiza o custo da variação (último custo pago)
create or replace function registrar_entrada(
  p_variacao uuid, p_quantidade integer, p_custo numeric default null, p_obs text default null
) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Apenas administradores registram entradas'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;
  if p_custo is not null and p_custo < 0 then raise exception 'Custo não pode ser negativo'; end if;
  perform 1 from estoque where variacao_id = p_variacao for update;
  if p_custo is not null then
    update variacoes set custo = p_custo where id = p_variacao and custo is distinct from p_custo;
  end if;
  return _movimentar(p_variacao, p_quantidade, 'entrada', null, p_obs, p_custo);
end $$;
