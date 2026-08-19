# Formulário Transporte Escolar + Sistema Anti-Pausa (Supabase)

Site estático (HTML puro) de cadastro de transporte escolar, hospedado na Vercel,
com um **sistema de monitoramento/keep-alive** para o Supabase:

```
GitHub → Vercel → Vercel Cron → /api/keep-alive → Supabase (system_health)
```

> ⚠️ **Importante (leia):** este repositório **não é um projeto Next.js**. É um site
> estático (`index.html`, `relatorios.html`, `monitor.html`) que usa **Vercel Functions
> zero-config** (pasta `/api`) para os endpoints. Essa é a forma correta de adicionar
> código serverless a um projeto estático da Vercel sem quebrar as páginas existentes.

---

## Como funciona

| Peça | O que faz |
| --- | --- |
| `vercel.json` | Agenda o **Vercel Cron** para chamar `/api/keep-alive` 1x por dia (limite do plano Hobby). |
| `api/keep-alive.ts` | Autenticado por **Bearer secret**; conecta no Supabase com a `service_role`, grava na tabela `system_health` e faz limpeza de registros antigos. |
| `api/health.ts` | Health check público: verifica se o Supabase responde e devolve estatísticas. |
| `monitor.html` | Dashboard em `/monitor` com status 🟢 Online / 🔴 Offline / 🟡 Atenção. |
| `supabase/schema.sql` | Cria a tabela `system_health` com RLS (não-destrutivo). |

### Endpoints

#### `GET /api/health` (público)
```json
{
  "status": "online",
  "service": "supabase",
  "response_time_ms": 123,
  "checked_at": "2026-08-19T10:00:00.000Z",
  "executions": 42,
  "last_ping": "2026-08-19T09:00:00.000Z",
  "last_status": "ok",
  "last_response_time_ms": 150,
  "last_error": null
}
```
Retorna `503` com `status: "offline"` se o Supabase não responder. Não expõe nenhum secret.

#### `GET /api/keep-alive` (protegido)
- Requer `Authorization: Bearer $KEEP_ALIVE_SECRET`.
- `401` se o secret estiver ausente ou incorreto; `405` se o método não for GET.
- Grava um registro em `system_health` com `service`, `status`, `executed_at`,
  `response_time_ms` e `error_message`.
- Executa a limpeza automática (mantém 30 dias / no máx. 1000 registros).
- `200` em sucesso, `500` se o Supabase falhar.

---

## ⚠️ Limite do plano Hobby da Vercel (leia antes de configurar)

O plano **Hobby (gratuito)** da Vercel tem as seguintes restrições para Cron Jobs:

1. **Máximo de 1 execução por dia.** Uma expressão como `*/30 * * * *` (a cada 30 min)
   **falha no deploy** com o erro:
   > Hobby accounts are limited to daily cron jobs...
2. Sem garantia de horário exato (ex.: `0 6 * * *` dispara entre 06:00 e 06:59).

Por isso o `vercel.json` usa `"schedule": "0 6 * * *"` (1x por dia, 06:00 UTC) — o que
**é permitido no Hobby**. Para pingar com mais frequência:

- **Opção A (recomendada):** usar um serviço externo gratuito que chame `/api/keep-alive`
  com o header `Authorization: Bearer $KEEP_ALIVE_SECRET` a cada poucos minutos. Exemplos:
  cron-job.org, UptimeRobot, GitHub Actions (cron), Better Uptime.
- **Opção B:** atualizar para o plano **Pro** (permite cron a cada minuto).
- **Opção C:** manter apenas o cron diário da Vercel.

---

## ⚠️ Sobre a pausa do Supabase (seja realista)

> Este sistema **gera atividade no banco**, mas **não garante** que o Supabase jamais
> será pausado. A política de pausa é controlada pelo Supabase e leva em conta diversos
> fatores (não apenas atividade recente). Considere este projeto como **monitoramento
> + redução do risco de pausa por inatividade**, não como garantia.

---

## Passo a passo

### 1. Criar projeto Supabase
Acesse [supabase.com](https://supabase.com) → New Project. Anote a **Project URL** e a
**Project API Key** (Settings → API).

### 2. Executar o SQL
No Supabase → **SQL Editor**, cole e execute o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
Ele cria a tabela `system_health` com:
- `id` UUID (primary key)
- `service`, `status`, `executed_at`, `response_time_ms`, `error_message`
- índice em `executed_at`
- **RLS habilitado sem policies** → apenas a `service_role` (que ignora RLS) acessa;
  anon/authenticated ficam bloqueados.

O script é **não-destrutivo** (`IF NOT EXISTS`, sem `DROP`).

### 3. Criar os secrets
Gere um secret forte (mínimo 16 caracteres):
```bash
openssl rand -hex 32
```
Use o mesmo valor para `KEEP_ALIVE_SECRET` e `CRON_SECRET`.

### 4. Configurar `.env.local`
```bash
cp .env.example .env.local
```
Preencha:
```env
NEXT_PUBLIC_SUPABASE_URL=<Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<chave pública/anon>
SUPABASE_SERVICE_ROLE_KEY=<service_role - PRIVADA, sem NEXT_PUBLIC_>
KEEP_ALIVE_SECRET=<seu secret>
CRON_SECRET=<mesmo secret>
```

> A `SUPABASE_SERVICE_ROLE_KEY` **nunca** deve ter o prefixo `NEXT_PUBLIC_` e **nunca**
> deve ser exposta no navegador. `.env.local` não é versionado.

### 5. Rodar localmente
```bash
npm install
npm run build        # typecheck (tsc --noEmit)
npm test             # testes dos endpoints
npm run lint         # idem build (typecheck)
```
Como o projeto é estático, para testar os endpoints localmente use o Vercel CLI:
```bash
npx vercel dev
```
- `GET http://localhost:3000/api/health`
- `GET http://localhost:3000/api/keep-alive` com header
  `Authorization: Bearer $KEEP_ALIVE_SECRET`
- Dashboard: `http://localhost:3000/monitor`

### 6. Criar repositório GitHub
```bash
git init
git add .
git commit -m "Adiciona sistema anti-pausa (Vercel Cron + Supabase)"
git remote add origin https://github.com/<usuario>/<repo>.git
git push -u origin main
```
Antes de commitar, confira que `.env*`, `node_modules/` e `.vercel/` estão ignorados.

### 7. Conectar à Vercel
Na [vercel.com](https://vercel.com) → Add New Project → importe o repositório.
O framework será detectado como **Other**. `vercel.json` já configura Cron, runtime e
rewrite de `/monitor`.

### 8. Configurar as Environment Variables
Em **Project → Settings → Environment Variables**, adicione (Production + Preview):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `KEEP_ALIVE_SECRET`
- `CRON_SECRET` (mesmo valor de `KEEP_ALIVE_SECRET`)

> A Vercel usa `CRON_SECRET` para enviar `Authorization: Bearer <CRON_SECRET>`
> automaticamente em cada invocação do cron.

### 9. Fazer deploy
```bash
npx vercel --prod
```
ou push para `main` (auto-deploy). O deploy **falhará** se a expressão de cron violar
os limites do plano.

### 10. Verificar o Cron
Em **Project → Settings → Cron Jobs**, confirme a entrada `0 6 * * *` para
`/api/keep-alive`. Em **Logs**, verifique a invocação diária e o status HTTP 200.

### 11. Testar `/api/health`
```bash
curl https://<seu-projeto>.vercel.app/api/health
```

### 12. Testar `/api/keep-alive`
```bash
curl -H "Authorization: Bearer $KEEP_ALIVE_SECRET" \
  https://<seu-projeto>.vercel.app/api/keep-alive
```
Sem o header (ou com header errado) → `401`.

### 13. Verificar registros no Supabase
Table Editor → `system_health`. A cada execução do cron aparece uma nova linha com
`service='keep-alive'`, `status='ok'` e `response_time_ms`.

### Dashboard
Acesse `https://<seu-projeto>.vercel.app/monitor`. Atualiza sozinho a cada 60s e mostra:
- 🟢 Online / 🔴 Offline / 🟡 Atenção (sem registros, último ping falhou ou resposta lenta)
- Último ping, tempo de resposta, quantidade de execuções, último erro.

---

## Segurança (revisado)

- ✅ `service_role` usada **apenas** nas Vercel Functions (`/api`), nunca no navegador.
- ✅ `SUPABASE_SERVICE_ROLE_KEY` sem prefixo `NEXT_PUBLIC_`.
- ✅ `system_health` com RLS habilitado e **sem policies** → bloqueada para chaves públicas.
- ✅ Endpoint `/api/keep-alive` exige `Authorization: Bearer` (com validação de secret configurado).
- ✅ Sem SQL injection: toda consulta usa a API REST do Supabase (PostgREST), sem interpolação de SQL.
- ✅ Erros sanitizados no JSON (sem secrets nos logs/respostas).
- ✅ Limpeza automática: mantém 30 dias e, no máximo, os 1.000 registros mais recentes.
- ✅ `.env*`, `node_modules/` e `.vercel/` no `.gitignore`.
- ⚠️ `/api/health` é público por design (mostra apenas status/estatísticas, sem secrets).
- ⚠️ As páginas existentes (`index.html`, `relatorios.html`) já usam a chave pública
  (publishable/anon) direto no navegador — comportamento padrão do Supabase e **não alterado**.

---

## Testes

```bash
npm test
```
Cobre: `/api/health` (online/offline/sem env/método), `/api/keep-alive`
(401 sem header, 401 secret errado, 200 válido, fallback `CRON_SECRET`, 503 sem secret,
405, 500 com erro do Supabase).

## Estrutura

```
api/
  keep-alive.ts   # endpoint protegido do cron
  health.ts       # health check público
lib/
  supabase.ts     # cliente Supabase REST (service_role, somente servidor)
  http.ts         # tipos/helpers de resposta
supabase/
  schema.sql      # tabela system_health + RLS (não-destrutivo)
test/             # testes (node:test + tsx)
monitor.html      # dashboard /monitor
vercel.json       # cron + runtime + rewrite
.env.example      # modelo de variáveis
index.html        # formulário (existente, inalterado)
relatorios.html   # painel do admin (existente, inalterado)
```

## Próximos passos sugeridos

1. Executar `supabase/schema.sql` no Supabase.
2. Configurar as variáveis de ambiente na Vercel (incl. `CRON_SECRET`).
3. Deploy e verificação do cron + `/monitor`.
4. (Opcional) Serviço externo para pingar o keep-alive com mais frequência que 1x/dia.