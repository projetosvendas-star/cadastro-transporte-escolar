import { sendJson, type Req, type Res } from '../lib/http.js';
import {
  cleanupHealthRecords,
  insertHealthRecord,
  isConfigured,
} from '../lib/supabase.js';

function resolveSecret(): string | undefined {
  return process.env.KEEP_ALIVE_SECRET ?? process.env.CRON_SECRET ?? undefined;
}

function getAuthorization(req: Req): string {
  const value = req.headers.authorization ?? req.headers.Authorization;
  return Array.isArray(value) ? value[0] : (value ?? '');
}

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { success: false, error: 'Method not allowed. Use GET.' });
    return;
  }

  const secret = resolveSecret();
  if (!secret) {
    sendJson(res, 503, {
      success: false,
      error: 'KEEP_ALIVE_SECRET/CRON_SECRET não configurado no servidor.',
    });
    return;
  }

  const auth = getAuthorization(req);
  if (auth !== `Bearer ${secret}`) {
    sendJson(res, 401, { success: false, error: 'Não autorizado. Secret inválida ou ausente.' });
    return;
  }

  if (!isConfigured()) {
    sendJson(res, 503, {
      success: false,
      error: 'Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).',
    });
    return;
  }

  const startedAt = Date.now();
  const executedAt = new Date().toISOString();

  let status: 'ok' | 'error' = 'ok';
  let errorMessage: string | null = null;

  try {
    await insertHealthRecord({
      service: 'keep-alive',
      status: 'ok',
      responseTimeMs: Date.now() - startedAt,
    });
  } catch (err) {
    status = 'error';
    errorMessage = err instanceof Error ? err.message : String(err);
    try {
      await insertHealthRecord({
        service: 'keep-alive',
        status: 'error',
        responseTimeMs: Date.now() - startedAt,
        errorMessage,
      });
    } catch {
      // melhor esforço: se o banco está fora, não há o que registrar
    }
  }

  if (status === 'ok') {
    try {
      await cleanupHealthRecords();
    } catch {
      // limpeza é best-effort; não falha o ping
    }
  }

  const responseTimeMs = Date.now() - startedAt;

  if (status === 'ok') {
    sendJson(res, 200, {
      success: true,
      status,
      service: 'keep-alive',
      response_time_ms: responseTimeMs,
      executed_at: executedAt,
    });
    return;
  }

  sendJson(res, 500, {
    success: false,
    status,
    service: 'keep-alive',
    response_time_ms: responseTimeMs,
    executed_at: executedAt,
    error: errorMessage,
  });
}