-- =====================================================================
-- Liang — Migration 002: regras de negócio (RPC)
-- Toda alteração de estoque passa por aqui e gera movimento.
-- =====================================================================

-- ---------- Interno: aplica um movimento e atualiza o saldo ----------
create or replace function _movimentar(
  p_variacao uuid, p_delta integer, p_tipo tipo_movimento,
  p_venda uuid default null, p_motivo text default null, p_custo numeric default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_saldo integer;
begin
  update estoque
     set quantidade = quantidade + p_delta, atualizado_em = now()
   where variacao_id = p_variacao
  returning quantidade into v_saldo;

  if not found then
    raise exception 'Variação % sem registro de estoque', p_variacao;
  end if;

  insert into movimentos (variacao_id, tipo, quantidade, saldo_apos, custo_unitario, venda_id, usuario_id, motivo)
  values (p_variacao, p_tipo, p_delta, v_saldo, p_custo, p_venda, auth.uid(), p_motivo);

  return v_saldo;
end $$;

revoke all on function _movimentar(uuid, integer, tipo_movimento, uuid, text, numeric) from public, anon, authenticated;

-- ---------- Registrar venda (online ou sincronizada do offline) ----------
-- p_itens: [{ "variacao_id": "...", "quantidade": 2 }, ...]
-- Retorna { ok, venda_id, total } ou { ok:false, erro, faltando:[...] }
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
begin
  if not is_ativo() then
    return jsonb_build_object('ok', false, 'erro', 'usuario_inativo');
  end if;

  -- Idempotência: a mesma venda enviada duas vezes não duplica
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

  -- Agrupa itens repetidos e trava as linhas de estoque em ordem fixa (evita deadlock)
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

  -- Itens que não existem no catálogo
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

  -- Preço vem sempre do catálogo (vendedor não altera preço)
  insert into vendas (id, cliente_nome, tipo_preco, forma_pagamento, total, vendedor_id, criada_em, offline)
  values (p_id, trim(p_cliente), p_tipo_preco, p_pagamento, 0, v_vendedor, p_criada_em, p_offline);

  insert into venda_itens (venda_id, variacao_id, quantidade, preco_unitario, custo_unitario)
  select p_id, v.id, i.quantidade,
         case when p_tipo_preco = 'atacado' then v.preco_atacado else v.preco_varejo end,
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

-- ---------- Entrada de mercadoria (admin) ----------
create or replace function registrar_entrada(
  p_variacao uuid, p_quantidade integer, p_custo numeric default null, p_obs text default null
) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Apenas administradores registram entradas'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;
  perform 1 from estoque where variacao_id = p_variacao for update;
  return _movimentar(p_variacao, p_quantidade, 'entrada', null, p_obs, p_custo);
end $$;

-- ---------- Ajuste de inventário (admin, motivo obrigatório) ----------
create or replace function ajustar_estoque(
  p_variacao uuid, p_nova_quantidade integer, p_motivo text
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_atual integer;
begin
  if not is_admin() then raise exception 'Apenas administradores ajustam estoque'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do ajuste'; end if;
  if p_nova_quantidade < 0 then raise exception 'Quantidade não pode ser negativa'; end if;

  select quantidade into v_atual from estoque where variacao_id = p_variacao for update;
  if v_atual = p_nova_quantidade then return v_atual; end if;
  return _movimentar(p_variacao, p_nova_quantidade - v_atual, 'ajuste', null, p_motivo);
end $$;

-- ---------- Cancelar venda (admin; devolver estoque é opcional) ----------
create or replace function cancelar_venda(
  p_venda uuid, p_motivo text, p_devolver_estoque boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare v_item record;
begin
  if not is_admin() then raise exception 'Apenas administradores cancelam vendas'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento'; end if;

  update vendas
     set status = 'cancelada', cancelada_por = auth.uid(), cancelada_em = now(),
         motivo_cancelamento = trim(p_motivo), estoque_devolvido = p_devolver_estoque
   where id = p_venda and status = 'concluida';
  if not found then raise exception 'Venda não encontrada ou já cancelada'; end if;

  if p_devolver_estoque then
    for v_item in select variacao_id, quantidade from venda_itens where venda_id = p_venda order by variacao_id loop
      perform 1 from estoque where variacao_id = v_item.variacao_id for update;
      perform _movimentar(v_item.variacao_id, v_item.quantidade, 'cancelamento', p_venda, trim(p_motivo));
    end loop;
  end if;
end $$;

-- ---------- Resolver ocorrência (admin) ----------
create or replace function resolver_ocorrencia(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Apenas administradores'; end if;
  update ocorrencias set resolvida = true, resolvida_por = auth.uid(), resolvida_em = now()
   where id = p_id and not resolvida;
end $$;

-- ---------- Catálogo completo para o aparelho (cache offline) ----------
create or replace view vw_catalogo with (security_invoker = true) as
select v.id               as variacao_id,
       p.id               as produto_id,
       p.codigo, p.tipo_id, t.nome as tipo,
       p.nome, p.marca, p.modelo, p.descricao, p.foto_url,
       v.nome             as variacao,
       v.preco_atacado, v.preco_varejo,
       v.codigo_barras, v.estoque_minimo,
       coalesce(e.quantidade, 0) as estoque,
       (select coalesce(jsonb_agg(c.modelo order by c.modelo), '[]'::jsonb)
          from compatibilidades c where c.produto_id = p.id and c.status = 'confirmada') as compativeis
  from variacoes v
  join produtos p on p.id = v.produto_id
  join tipos t    on t.id = p.tipo_id
  left join estoque e on e.variacao_id = v.id
 where v.ativo and p.ativo;

-- ---------- Dashboard (admin) ----------
create or replace function dashboard_resumo(p_inicio timestamptz, p_fim timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not is_admin() then raise exception 'Apenas administradores'; end if;

  with vs as (
    select * from vendas where status = 'concluida' and criada_em >= p_inicio and criada_em < p_fim
  ), it as (
    select i.*, vs.vendedor_id, vs.tipo_preco from venda_itens i join vs on vs.id = i.venda_id
  )
  select jsonb_build_object(
    'faturamento',    coalesce((select sum(total) from vs), 0),
    'vendas',         (select count(*) from vs),
    'itens',          coalesce((select sum(quantidade) from it), 0),
    'ticket_medio',   coalesce((select round(avg(total), 2) from vs), 0),
    'lucro_estimado', coalesce((select sum((preco_unitario - custo_unitario) * quantidade) from it where custo_unitario is not null), 0),
    'itens_sem_custo',coalesce((select sum(quantidade) from it where custo_unitario is null), 0),
    'por_dia',        coalesce((select jsonb_agg(d order by d->>'dia') from (
                         select jsonb_build_object('dia', to_char(criada_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
                                                   'total', sum(total), 'vendas', count(*)) d
                           from vs group by to_char(criada_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')) x), '[]'),
    'por_vendedor',   coalesce((select jsonb_agg(x order by (x->>'total')::numeric desc) from (
                         select jsonb_build_object('nome', p.nome, 'total', sum(vs.total), 'vendas', count(*)) x
                           from vs join perfis p on p.id = vs.vendedor_id group by p.nome) y), '[]'),
    'por_pagamento',  coalesce((select jsonb_object_agg(forma_pagamento, t) from (
                         select forma_pagamento, sum(total) t from vs group by forma_pagamento) z), '{}'),
    'por_tipo_preco', coalesce((select jsonb_object_agg(tipo_preco, t) from (
                         select tipo_preco, sum(total) t from vs group by tipo_preco) z), '{}'),
    'mais_vendidos',  coalesce((select jsonb_agg(x) from (
                         select jsonb_build_object('codigo', p.codigo, 'produto', p.nome, 'variacao', v.nome,
                                                   'quantidade', sum(it.quantidade), 'total', sum(it.subtotal)) x
                           from it join variacoes v on v.id = it.variacao_id join produtos p on p.id = v.produto_id
                          group by p.codigo, p.nome, v.nome order by sum(it.quantidade) desc limit 10) y), '[]'),
    'estoque_baixo',  coalesce((select jsonb_agg(x) from (
                         select jsonb_build_object('codigo', codigo, 'produto', nome, 'variacao', variacao,
                                                   'estoque', estoque, 'minimo', estoque_minimo) x
                           from vw_catalogo where estoque <= estoque_minimo order by estoque limit 20) y), '[]'),
    'valor_estoque',  jsonb_build_object(
                         'custo',  coalesce((select sum(e.quantidade * v.custo) from estoque e join variacoes v on v.id = e.variacao_id where e.quantidade > 0), 0),
                         'varejo', coalesce((select sum(e.quantidade * v.preco_varejo) from estoque e join variacoes v on v.id = e.variacao_id where e.quantidade > 0), 0)),
    'ocorrencias_abertas', (select count(*) from ocorrencias where not resolvida)
  ) into r;
  return r;
end $$;

-- ---------- Permissões das funções ----------
revoke all on function registrar_venda(uuid, text, tipo_preco, forma_pagamento, jsonb, timestamptz, boolean) from public, anon;
revoke all on function registrar_entrada(uuid, integer, numeric, text) from public, anon;
revoke all on function ajustar_estoque(uuid, integer, text) from public, anon;
revoke all on function cancelar_venda(uuid, text, boolean) from public, anon;
revoke all on function resolver_ocorrencia(uuid) from public, anon;
revoke all on function dashboard_resumo(timestamptz, timestamptz) from public, anon;

grant execute on function registrar_venda(uuid, text, tipo_preco, forma_pagamento, jsonb, timestamptz, boolean) to authenticated;
grant execute on function registrar_entrada(uuid, integer, numeric, text) to authenticated;
grant execute on function ajustar_estoque(uuid, integer, text) to authenticated;
grant execute on function cancelar_venda(uuid, text, boolean) to authenticated;
grant execute on function resolver_ocorrencia(uuid) to authenticated;
grant execute on function dashboard_resumo(timestamptz, timestamptz) to authenticated;

-- ---------- Fotos dos produtos ----------
insert into storage.buckets (id, name, public) values ('produtos', 'produtos', true)
on conflict (id) do nothing;

create policy fotos_leitura on storage.objects for select to authenticated
  using (bucket_id = 'produtos');
create policy fotos_admin on storage.objects for all to authenticated
  using (bucket_id = 'produtos' and is_admin()) with check (bucket_id = 'produtos' and is_admin());
