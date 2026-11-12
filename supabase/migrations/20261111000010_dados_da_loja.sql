-- =====================================================================
-- Liang — Migration 010: dados da loja para a notinha (11/11/2026)
-- Uma linha só (id = true), lida por qualquer usuário ativo (a notinha
-- sai também no aparelho do vendedor) e alterada só pelo admin.
-- Não há INSERT nem DELETE para authenticated: a linha nunca some nem duplica.
-- =====================================================================

create table loja (
  id             boolean primary key default true check (id),
  nome           text not null default 'Mundo Mix' check (length(trim(nome)) between 1 and 60),
  cnpj           text check (cnpj is null or length(cnpj) <= 20),
  endereco       text not null default '' check (length(endereco) <= 200),
  telefone       text not null default '' check (length(telefone) <= 30),
  rodape         text not null default '' check (length(rodape) <= 200),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references perfis(id)
);
create index loja_atualizado_por_idx on loja (atualizado_por);

insert into loja (rodape) values ('Obrigado pela preferência!');

-- Quem alterou e quando: preenchido pelo banco, não pelo app
create or replace function trg_loja_alterada() returns trigger
language plpgsql set search_path = public as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
revoke all on function trg_loja_alterada() from public, anon, authenticated;

create trigger loja_alterada
  before update on loja
  for each row execute function trg_loja_alterada();

alter table loja enable row level security;
create policy loja_select       on loja for select to authenticated using ((select is_ativo()));
create policy loja_admin_update on loja for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));

revoke all on loja from anon, authenticated;
grant select on loja to authenticated;
grant update (nome, cnpj, endereco, telefone, rodape) on loja to authenticated;
