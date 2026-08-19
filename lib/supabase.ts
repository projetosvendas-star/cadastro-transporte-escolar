type FetchLike = typeof fetch;

const TABLE = 'system_health';

export function isConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function baseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL não configurado no servidor.');
  return url.replace(/\/$/, '');
}

function serviceHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurado no servidor.');
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function rest(
  path: string,
  init: RequestInit,
  fetchImpl: FetchLike,
): Promise<Response> {
  const url = `${baseUrl()}/rest/v1${path}`;
  const headers = {
    ...serviceHeaders(),
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  return fetchImpl(url, { ...init, headers });
}

async function ok(res: Response): Promise<Response> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase REST ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  return res;
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

export interface HealthRecordInput {
  service: string;
  status: 'ok' | 'error';
  responseTimeMs?: number;
  errorMessage?: string | null;
}

export interface HealthRecord {
  service: string;
  status: string;
  executed_at: string;
  response_time_ms: number | null;
  error_message: string | null;
}

export interface HealthStats {
  count: number | null;
  last: HealthRecord | null;
}

export async function pingSupabase(fetchImpl: FetchLike = fetch): Promise<void> {
  const res = await ok(await rest(`/${TABLE}?select=id&limit=1`, {}, fetchImpl));
  void res;
}

export async function insertHealthRecord(
  input: HealthRecordInput,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const payload = {
    service: input.service,
    status: input.status,
    response_time_ms: input.responseTimeMs ?? null,
    error_message: input.errorMessage ?? null,
  };
  await ok(
    await rest(
      `/${TABLE}`,
      {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify([payload]),
      },
      fetchImpl,
    ),
  );
}

export async function getHealthStats(fetchImpl: FetchLike = fetch): Promise<HealthStats> {
  let count: number | null = null;
  let last: HealthRecord | null = null;

  try {
    const countRes = await rest(
      `/${TABLE}?select=id&limit=0`,
      { headers: { Prefer: 'count=exact' } },
      fetchImpl,
    );
    if (countRes.ok) {
      const contentRange = countRes.headers.get('content-range') ?? '';
      const match = contentRange.match(/\/(\d+)$/);
      if (match) count = Number(match[1]);
    }
  } catch {
    count = null;
  }

  try {
    const lastRes = await ok(
      await rest(
        `/${TABLE}?select=service,status,executed_at,response_time_ms,error_message&order=executed_at.desc&limit=1`,
        {},
        fetchImpl,
      ),
    );
    const rows = (await lastRes.json()) as HealthRecord[];
    if (Array.isArray(rows) && rows.length > 0) last = rows[0];
  } catch {
    last = null;
  }

  return { count, last };
}

export async function cleanupHealthRecords(fetchImpl: FetchLike = fetch): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await ok(
    await rest(
      `/${TABLE}?executed_at=lt.${encode(cutoff)}`,
      { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
      fetchImpl,
    ),
  );

  const listRes = await rest(
    `/${TABLE}?select=id&order=executed_at.desc&limit=1000`,
    {},
    fetchImpl,
  );
  if (!listRes.ok) return;
  const rows = (await listRes.json()) as { id: string }[];
  if (Array.isArray(rows) && rows.length >= 1000) {
    const ids = rows.map((r) => r.id).join(',');
    await ok(
      await rest(
        `/${TABLE}?id=not.in.(${ids})`,
        { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
        fetchImpl,
      ),
    );
  }
}