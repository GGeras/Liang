-- =====================================================================
-- Liang — Migration 008: código de barras OU 00-00 (decisão do dono, 09/11/2026)
--  - Produto com código de barras não tem 00-00 (seq nulo → codigo nulo);
--    toda variação dele tem o próprio código de barras.
--  - Produto sem código de barras usa o 00-00 (tipo + número) e nenhuma
--    variação tem código de barras.
--  - O tipo continua obrigatório nos dois casos: é a categoria (Telas,
--    Baterias…) usada para agrupar e filtrar.
--  A regra é checada no fim da transação (constraint trigger), seja qual for
--  o caminho da gravação.
-- =====================================================================

alter table produtos alter column seq drop not null;   -- codigo (gerado) fica nulo junto

alter table variacoes add constraint codigo_barras_nao_vazio
  check (codigo_barras is null or length(trim(codigo_barras)) > 0);

create or replace function checar_identificacao(p_produto uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_seq smallint;
begin
  select seq into v_seq from produtos where id = p_produto;
  if not found then return; end if;
  if v_seq is null then
    if exists (select 1 from variacoes where produto_id = p_produto and codigo_barras is null) then
      raise exception 'Produto sem código 00-00 precisa de código de barras em todas as variações';
    end if;
  elsif exists (select 1 from variacoes where produto_id = p_produto and codigo_barras is not null) then
    raise exception 'Produto com código 00-00 não usa código de barras: é um ou outro';
  end if;
end $$;
revoke all on function checar_identificacao(uuid) from public, anon, authenticated;

create or replace function trg_checar_identificacao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform checar_identificacao(case when tg_table_name = 'produtos' then new.id else new.produto_id end);
  return null;
end $$;
revoke all on function trg_checar_identificacao() from public, anon, authenticated;

create constraint trigger produtos_identificacao
  after insert or update of seq on produtos
  deferrable initially deferred
  for each row execute function trg_checar_identificacao();

create constraint trigger variacoes_identificacao
  after insert or update of codigo_barras, produto_id on variacoes
  deferrable initially deferred
  for each row execute function trg_checar_identificacao();

-- ---------- registrar_venda: itens recusados levam também o código de barras ----------
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
           p.codigo, v.codigo_barras, p.nome, v.nome as variacao
      from (select (x->>'variacao_id')::uuid as variacao_id, (x->>'quantidade')::int as quantidade
              from jsonb_array_elements(p_itens) x) i
      join variacoes v on v.id = i.variacao_id
      join produtos  p on p.id = v.produto_id
     group by i.variacao_id, v.ativo, p.ativo, p.codigo, v.codigo_barras, p.nome, v.nome
     order by i.variacao_id
  loop
    perform 1 from estoque where variacao_id = v_item.variacao_id for update;
    if not v_item.ativo or not v_item.produto_ativo
       or (select quantidade from estoque where variacao_id = v_item.variacao_id) < v_item.quantidade then
      v_faltando := v_faltando || jsonb_build_object(
        'variacao_id', v_item.variacao_id, 'codigo', v_item.codigo, 'codigo_barras', v_item.codigo_barras,
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

-- ---------- dashboard_resumo: rankings levam também o código de barras ----------
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
                         select jsonb_build_object('codigo', p.codigo, 'codigo_barras', v.codigo_barras, 'produto', p.nome, 'variacao', v.nome,
                                                   'quantidade', sum(it.quantidade), 'total', sum(it.subtotal)) x
                           from it join variacoes v on v.id = it.variacao_id join produtos p on p.id = v.produto_id
                          group by p.codigo, v.codigo_barras, p.nome, v.nome order by sum(it.quantidade) desc limit 10) y), '[]'),
    'estoque_baixo',  coalesce((select jsonb_agg(x) from (
                         select jsonb_build_object('codigo', codigo, 'codigo_barras', codigo_barras, 'produto', nome, 'variacao', variacao,
                                                   'estoque', estoque, 'minimo', estoque_minimo) x
                           from vw_catalogo where estoque <= estoque_minimo order by estoque limit 20) y), '[]'),
    'valor_estoque',  jsonb_build_object(
                         'custo',  coalesce((select sum(e.quantidade * v.custo) from estoque e join variacoes v on v.id = e.variacao_id where e.quantidade > 0), 0),
                         'varejo', coalesce((select sum(e.quantidade * v.preco_varejo) from estoque e join variacoes v on v.id = e.variacao_id where e.quantidade > 0), 0)),
    'ocorrencias_abertas', (select count(*) from ocorrencias where not resolvida)
  ) into r;
  return r;
end $$;
revoke all on function dashboard_resumo(timestamptz, timestamptz) from public, anon;
grant execute on function dashboard_resumo(timestamptz, timestamptz) to authenticated;
