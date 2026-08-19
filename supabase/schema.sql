-- ============================================================
-- Sistema Anti-Pausa Supabase
-- Tabela system_health
-- Execute este script no SQL Editor do Supabase.
-- É NÃO-destrutivo: usa IF NOT EXISTS e não executa DROP.
-- ============================================================

-- Suporte a uuid aleatório (já nativo no Postgres 13+; mantido por segurança)
create extension if not exists "pgcrypto";

-- Tabela de registro de execuções do keep-alive / health check
create table if not exists public.system_health (
  id uuid primary key default gen_random_uuid(),
  service text not null default 'keep-alive',
  status text not null check (status in ('ok', 'error')),
  executed_at timestamptz not null default now(),
  response_time_ms integer,
  error_message text
);

-- Índice para consultas por data (últimos registros / limpeza por retenção)
create index if not exists system_health_executed_at_idx
  on public.system_health (executed_at desc);

-- ============================================================
-- Segurança
-- ============================================================

-- Row Level Security: SEM policies, anon/authenticated ficam bloqueados
-- por padrão. Apenas a service_role (que ignora RLS) manipula esta tabela,
-- portanto a chave service_role nunca é exposta e os registros não são
-- legíveis por chaves públicas.
alter table public.system_health enable row level security;

-- Reforço: revoga privilégios diretos das roles públicas.
revoke all on table public.system_health from anon, authenticated;

-- Observação: se futuramente quiser permitir leitura para o painel via
-- anon, crie uma policy explícita com SELECT restrito. Recomenda-se NÃO
-- expor esta tabela publicamente (ela só interessa ao servidor).