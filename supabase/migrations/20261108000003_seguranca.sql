-- Liang — Migration 003: endurecimento apontado pelo linter do Supabase
alter function trg_bloqueia_alteracao() set search_path = public;
alter function trg_atualizado_em()      set search_path = public;

-- Funções de trigger não devem ser chamadas via API
revoke all on function trg_novo_usuario()     from public, anon, authenticated;
revoke all on function trg_variacao_estoque() from public, anon, authenticated;

-- Helpers de permissão: só usuários logados (usados pelas policies)
revoke all on function is_admin() from public, anon;
revoke all on function is_ativo() from public, anon;
grant execute on function is_admin() to authenticated;
grant execute on function is_ativo() to authenticated;
