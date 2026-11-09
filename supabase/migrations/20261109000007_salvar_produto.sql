-- =====================================================================
-- Liang — Migration 007: salvar produto numa única transação (admin)
-- Com o custo fora do SELECT do authenticated (migration 006), o upsert
-- direto em `variacoes` deixou de funcionar. A gravação do produto passa
-- a ser feita por esta função: tudo ou nada (produto, variações,
-- compatibilidades), auditada pelos triggers de alteracoes_catalogo.
-- =====================================================================
create or replace function salvar_produto(
  p_produto jsonb,           -- {id, tipo_id, seq, nome, marca, modelo, descricao, foto_url, ativo}
  p_variacoes jsonb,         -- [{id, nome, preco_atacado, preco_varejo, custo, codigo_barras, estoque_minimo, ativo}]
  p_compat jsonb,            -- [{id, modelo, status, observacao}]
  p_compat_remover uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := (p_produto->>'id')::uuid;
begin
  if not is_admin() then raise exception 'Apenas administradores'; end if;
  if v_id is null then raise exception 'Produto sem id'; end if;
  if jsonb_typeof(p_variacoes) is distinct from 'array' or jsonb_array_length(p_variacoes) = 0 then
    raise exception 'Informe ao menos uma variação';
  end if;

  insert into produtos (id, tipo_id, seq, nome, marca, modelo, descricao, foto_url, ativo)
  values (v_id, (p_produto->>'tipo_id')::smallint, (p_produto->>'seq')::smallint, trim(p_produto->>'nome'),
          nullif(trim(p_produto->>'marca'), ''), nullif(trim(p_produto->>'modelo'), ''),
          nullif(trim(p_produto->>'descricao'), ''), nullif(p_produto->>'foto_url', ''),
          coalesce((p_produto->>'ativo')::boolean, true))
  on conflict (id) do update set
    tipo_id = excluded.tipo_id, seq = excluded.seq, nome = excluded.nome, marca = excluded.marca,
    modelo = excluded.modelo, descricao = excluded.descricao, foto_url = excluded.foto_url, ativo = excluded.ativo;

  insert into variacoes (id, produto_id, nome, preco_atacado, preco_varejo, custo, codigo_barras, estoque_minimo, ativo)
  select x.id, v_id, trim(x.nome), x.preco_atacado, x.preco_varejo, x.custo,
         nullif(trim(x.codigo_barras), ''), coalesce(x.estoque_minimo, 0), coalesce(x.ativo, true)
    from jsonb_to_recordset(p_variacoes) as x(id uuid, nome text, preco_atacado numeric, preco_varejo numeric,
                                               custo numeric, codigo_barras text, estoque_minimo integer, ativo boolean)
  on conflict (id) do update set
    nome = excluded.nome, preco_atacado = excluded.preco_atacado, preco_varejo = excluded.preco_varejo,
    custo = excluded.custo, codigo_barras = excluded.codigo_barras, estoque_minimo = excluded.estoque_minimo,
    ativo = excluded.ativo
  where variacoes.produto_id = v_id;   -- nunca move variação de outro produto

  if coalesce(array_length(p_compat_remover, 1), 0) > 0 then
    delete from compatibilidades where id = any(p_compat_remover) and produto_id = v_id;
  end if;

  if jsonb_typeof(p_compat) = 'array' and jsonb_array_length(p_compat) > 0 then
    insert into compatibilidades (id, produto_id, modelo, status, observacao, criado_por)
    select x.id, v_id, trim(x.modelo), coalesce(x.status, 'a_confirmar'), nullif(trim(x.observacao), ''), auth.uid()
      from jsonb_to_recordset(p_compat) as x(id uuid, modelo text, status status_compat, observacao text)
    on conflict (id) do update set
      modelo = excluded.modelo, status = excluded.status, observacao = excluded.observacao
    where compatibilidades.produto_id = v_id;
  end if;

  return v_id;
end $$;

revoke all on function salvar_produto(jsonb, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function salvar_produto(jsonb, jsonb, jsonb, uuid[]) to authenticated;
