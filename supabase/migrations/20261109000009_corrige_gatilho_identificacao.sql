-- Liang — Migration 009: corrige o gatilho da 008.
-- O `case` avaliava new.produto_id também quando o gatilho vinha de `produtos`
-- (que não tem essa coluna) e quebrava ao gravar produto.
create or replace function trg_checar_identificacao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'produtos' then
    perform checar_identificacao(new.id);
  else
    perform checar_identificacao(new.produto_id);
  end if;
  return null;
end $$;
revoke all on function trg_checar_identificacao() from public, anon, authenticated;
