import { sendJson, type Req, type Res } from '../lib/http.js';
import { getHealthStats, isConfigured, pingSupabase } from '../lib/supabase.js';

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { success: false, error: 'Method not allowed. Use GET.' });
    return;
  }

  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();

  if (!isConfigured()) {
    sendJson(res, 503, {
      status: 'offline',
      service: 'supabase',
      response_time_ms: Date.now() - startedAt,
      checked_at: checkedAt,
      error: 'Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).',
    });
    return;
  }

  try {
    await pingSupabase();
    const { count, last } = await getHealthStats();
    sendJson(res, 200, {
      status: 'online',
      service: 'supabase',
      response_time_ms: Date.now() - startedAt,
      checked_at: checkedAt,
      executions: count,
      last_ping: last?.executed_at ?? null,
      last_status: last?.status ?? null,
      last_response_time_ms: last?.response_time_ms ?? null,
      last_error: last?.error_message ?? null,
    });
  } catch (err) {
    sendJson(res, 503, {
      status: 'offline',
      service: 'supabase',
      response_time_ms: Date.now() - startedAt,
      checked_at: checkedAt,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}