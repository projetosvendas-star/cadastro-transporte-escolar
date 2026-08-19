import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import handler from '../api/health';
import {
  installFetch,
  jsonResponse,
  makeReq,
  makeRes,
  restoreFetch,
} from './helpers';

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
});

after(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  restoreFetch();
});

test('GET /api/health → 200 online quando Supabase responde', async () => {
  installFetch(async (url) => {
    if (url.includes('order=executed_at')) {
      return jsonResponse([
        {
          service: 'keep-alive',
          status: 'ok',
          executed_at: '2026-08-19T00:00:00.000Z',
          response_time_ms: 123,
          error_message: null,
        },
      ]);
    }
    if (url.includes('limit=0')) {
      return jsonResponse([], 200, { 'content-range': '0-0/42' });
    }
    return jsonResponse([]);
  });

  const res = makeRes();
  await handler(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'online');
  assert.equal(res.body.service, 'supabase');
  assert.equal(res.body.executions, 42);
  assert.equal(res.body.last_status, 'ok');
  assert.equal(res.body.last_ping, '2026-08-19T00:00:00.000Z');
  assert.equal(res.body.last_response_time_ms, 123);
  assert.equal(res.body.last_error, null);
  assert.equal(typeof res.body.response_time_ms, 'number');
  assert.equal(typeof res.body.checked_at, 'string');
});

test('GET /api/health → 503 offline quando Supabase falha', async () => {
  installFetch(async () => {
    throw new Error('Supabase indisponível');
  });

  const res = makeRes();
  await handler(makeReq(), res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.status, 'offline');
  assert.match(res.body.error, /Supabase indisponível/);
});

test('GET /api/health → 503 offline sem variáveis de ambiente', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const res = makeRes();
  await handler(makeReq(), res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.status, 'offline');
  assert.match(res.body.error, /não configurado/);
});

test('GET /api/health → 405 para método não permitido', async () => {
  const res = makeRes();
  await handler(makeReq({ method: 'POST' }), res);
  assert.equal(res.statusCode, 405);
});