-- =====================================================================
-- Liang — controle de estoque Mundo Mix
-- Migration 001: estrutura base, histórico imutável e permissões
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type papel_usuario   as enum ('admin', 'vendedor');
create type tipo_preco      as enum ('atacado', 'varejo');
create type forma_pagamento as enum ('dinheiro', 'pix', 'cartao');
create type tipo_movimento  as enum ('entrada', 'venda', 'ajuste', 'cancelamento');
create type status_venda    as enum ('concluida', 'cancelada');
create type status_compat   as enum ('confirmada', 'a_confirmar');

-- ---------- Perfis ----------
create table perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  papel      papel_usuario not null default 'vendedor',
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and papel = 'admin' and ativo);
$$;

create or replace function is_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and ativo);
$$;

-- Cria o perfil automaticamente quando um usuário é criado no Auth
create or replace function trg_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, nome, papel)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'papel')::papel_usuario, 'vendedor')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function trg_novo_usuario();

-- ---------- Catálogo ----------
-- Tipo = 2 primeiros dígitos do código (00-99)
create table tipos (
  id         smallint primary key check (id between 0 and 99),
  nome       text not null unique,
  criado_em  timestamptz not null default now()
);

-- Produto = código 00-00
create table produtos (
  id             uuid primary key default gen_random_uuid(),
  tipo_id        smallint not null references tipos(id),
  seq            smallint not null check (seq between 0 and 99),
  codigo         text generated always as (lpad(tipo_id::text, 2, '0') || '-' || lpad(seq::text, 2, '0')) stored,
  nome           text not null,
  marca          text,
  modelo         text,
  descricao      text,
  foto_url       text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (tipo_id, seq)
);
create unique index produtos_codigo_idx on produtos (codigo);

-- Variação = cor / qualidade (Incell, OLED, JK...). Estoque e preço ficam aqui.
-- Todo produto tem ao menos uma variação ("Padrão").
create table variacoes (
  id              uuid primary key default gen_random_uuid(),
  produto_id      uuid not null references produtos(id) on delete restrict,
  nome            text not null default 'Padrão',
  preco_atacado   numeric(10,2) not null check (preco_atacado >= 0),
  preco_varejo    numeric(10,2) not null check (preco_varejo >= 0),
  custo           numeric(10,2) check (custo >= 0),          -- opcional
  codigo_barras   text unique,                               -- opcional
  estoque_minimo  integer not null default 0 check (estoque_minimo >= 0),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (produto_id, nome)
);

-- Compatibilidades: só admin cadastra. Sugestões ficam "a_confirmar"
-- e não aparecem para o vendedor.
create table compatibilidades (
  id          uuid primary key default gen_random_uuid(),
  produto_id  uuid not null references produtos(id) on delete cascade,
  modelo      text not null,
  status      status_compat not null default 'a_confirmar',
  observacao  text,
  criado_por  uuid references perfis(id),
  criado_em   timestamptz not null default now(),
  unique (produto_id, modelo)
);

-- ---------- Estoque (saldo derivado do histórico) ----------
-- Ninguém escreve aqui diretamente: só o trigger de movimentos.
create table estoque (
  variacao_id    uuid primary key references variacoes(id) on delete restrict,
  quantidade     integer not null default 0,
  atualizado_em  timestamptz not null default now()
);

create or replace function trg_variacao_estoque() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into estoque (variacao_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger variacao_cria_estoque
  after insert on variacoes
  for each row execute function trg_variacao_estoque();

-- ---------- Vendas ----------
create table vendas (
  id                    uuid primary key,              -- gerado no aparelho (idempotência offline)
  cliente_nome          text not null,
  tipo_preco            tipo_preco not null,
  forma_pagamento       forma_pagamento not null,
  total                 numeric(12,2) not null,
  vendedor_id           uuid not null references perfis(id),
  status                status_venda not null default 'concluida',
  criada_em             timestamptz not null,          -- horário no aparelho
  sincronizada_em       timestamptz not null default now(),
  offline               boolean not null default false,
  cancelada_por         uuid references perfis(id),
  cancelada_em          timestamptz,
  motivo_cancelamento   text,
  estoque_devolvido     boolean,
  constraint cartao_so_varejo check (not (tipo_preco = 'atacado' and forma_pagamento = 'cartao'))
);
create index vendas_criada_idx   on vendas (criada_em desc);
create index vendas_vendedor_idx on vendas (vendedor_id, criada_em desc);

create table venda_itens (
  id              uuid primary key default gen_random_uuid(),
  venda_id        uuid not null references vendas(id) on delete restrict,
  variacao_id     uuid not null references variacoes(id),
  quantidade      integer not null check (quantidade > 0),
  preco_unitario  numeric(10,2) not null,
  custo_unitario  numeric(10,2),
  subtotal        numeric(12,2) generated always as (quantidade * preco_unitario) stored
);
create index venda_itens_venda_idx on venda_itens (venda_id);

-- ---------- Histórico imutável ----------
create table movimentos (
  id              bigint generated always as identity primary key,
  variacao_id     uuid not null references variacoes(id),
  tipo            tipo_movimento not null,
  quantidade      integer not null check (quantidade <> 0),  -- + entra / - sai
  saldo_apos      integer not null,
  custo_unitario  numeric(10,2),
  venda_id        uuid references vendas(id),
  usuario_id      uuid not null references perfis(id),
  motivo          text,
  criado_em       timestamptz not null default now()
);
create index movimentos_variacao_idx on movimentos (variacao_id, criado_em desc);
create index movimentos_data_idx     on movimentos (criado_em desc);

-- Bloqueia edição/remoção do histórico, até para admin
create or replace function trg_bloqueia_alteracao() returns trigger
language plpgsql as $$
begin
  raise exception 'O histórico é imutável: % não permitido em %', tg_op, tg_table_name;
end $$;

create trigger movimentos_imutaveis
  before update or delete on movimentos
  for each row execute function trg_bloqueia_alteracao();

create trigger venda_itens_imutaveis
  before update or delete on venda_itens
  for each row execute function trg_bloqueia_alteracao();

-- ---------- Ocorrências (ex.: venda offline sem estoque) ----------
create table ocorrencias (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null,                -- 'venda_sem_estoque'
  mensagem       text not null,
  dados          jsonb not null default '{}',
  usuario_id     uuid references perfis(id),
  resolvida      boolean not null default false,
  resolvida_por  uuid references perfis(id),
  resolvida_em   timestamptz,
  criado_em      timestamptz not null default now()
);
create index ocorrencias_abertas_idx on ocorrencias (resolvida, criado_em desc);

-- ---------- updated_at ----------
create or replace function trg_atualizado_em() returns trigger
language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;

create trigger produtos_atualizado  before update on produtos  for each row execute function trg_atualizado_em();
create trigger variacoes_atualizado before update on variacoes for each row execute function trg_atualizado_em();

-- =====================================================================
-- RLS
-- =====================================================================
alter table perfis           enable row level security;
alter table tipos            enable row level security;
alter table produtos         enable row level security;
alter table variacoes        enable row level security;
alter table compatibilidades enable row level security;
alter table estoque          enable row level security;
alter table vendas           enable row level security;
alter table venda_itens      enable row level security;
alter table movimentos       enable row level security;
alter table ocorrencias      enable row level security;

-- Perfis: cada um vê o seu; admin vê e edita todos
create policy perfis_select on perfis for select to authenticated
  using (id = auth.uid() or is_admin());
create policy perfis_admin_update on perfis for update to authenticated
  using (is_admin()) with check (is_admin());

-- Catálogo: qualquer usuário ativo lê; só admin escreve
create policy tipos_select on tipos for select to authenticated using (is_ativo());
create policy tipos_admin  on tipos for all    to authenticated using (is_admin()) with check (is_admin());

create policy produtos_select on produtos for select to authenticated using (is_ativo());
create policy produtos_admin  on produtos for all    to authenticated using (is_admin()) with check (is_admin());

create policy variacoes_select on variacoes for select to authenticated using (is_ativo());
create policy variacoes_admin  on variacoes for all    to authenticated using (is_admin()) with check (is_admin());

-- Vendedor só vê compatibilidades confirmadas
create policy compat_select on compatibilidades for select to authenticated
  using (is_admin() or (is_ativo() and status = 'confirmada'));
create policy compat_admin on compatibilidades for all to authenticated
  using (is_admin()) with check (is_admin());

-- Estoque: leitura para todos os ativos; escrita só pelas funções
create policy estoque_select on estoque for select to authenticated using (is_ativo());

-- Vendas: vendedor vê as próprias; admin vê todas. Escrita só por função.
create policy vendas_select on vendas for select to authenticated
  using (vendedor_id = auth.uid() or is_admin());
create policy venda_itens_select on venda_itens for select to authenticated
  using (exists (select 1 from vendas v where v.id = venda_id and (v.vendedor_id = auth.uid() or is_admin())));

-- Histórico e ocorrências: só admin
create policy movimentos_select  on movimentos  for select to authenticated using (is_admin());
create policy ocorrencias_select on ocorrencias for select to authenticated using (is_admin());
