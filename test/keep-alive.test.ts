import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import handler from '../api/keep-alive';
import {
  installFetch,
  jsonResponse,
  makeReq,
  makeRes,
  restoreFetch,
} from './helpers';

const SECRET = 'secret-teste-123';

interface Call {
  url: string;
  init?: RequestInit;
}

let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  process.env.KEEP_ALIVE_SECRET = SECRET;
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
});

after(() => {
  delete process.env.KEEP_ALIVE_SECRET;
  delete process.env.CRON_SECRET;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  restoreFetch();
});

function mockOkFetch(): void {
  installFetch(async (url, init) => {
    calls.push({ url, init });
    const method = init?.method ?? 'GET';
    if (method === 'POST') return jsonResponse([], 201);
    if (method === 'DELETE') return jsonResponse([], 204);
    return jsonResponse([]);
  });
}

function postCalls(): Call[] {
  return calls.filter((c) => c.url.includes('/rest/v1/system_health') && c.init?.method === 'POST');
}

test('GET /api/keep-alive → 401 sem Authorization', async () => {
  mockOkFetch();
  const res = makeRes();
  await handler(makeReq(), res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
});

test('GET /api/keep-alive → 401 com secret incorreto', async () => {
  mockOkFetch();
  const res = makeRes();
  await handler(
    makeReq({ headers: { authorization: 'Bearer secret-errado' } }),
    res,
  );

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
});

test('GET /api/keep-alive → 200 success com secret válido', async () => {
  mockOkFetch();
  const res = makeRes();
  await handler(
    makeReq({ headers: { authorization: `Bearer ${SECRET}` } }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.service, 'keep-alive');
  assert.equal(typeof res.body.response_time_ms, 'number');
  assert.equal(typeof res.body.executed_at, 'string');

  const inserts = postCalls();
  assert.equal(inserts.length, 1);
  const payload = JSON.parse(inserts[0].init!.body as string) as Array<{
    service: string;
    status: string;
    response_time_ms: number;
    error_message: string | null;
  }>;
  assert.equal(payload[0].service, 'keep-alive');
  assert.equal(payload[0].status, 'ok');
});

test('GET /api/keep-alive → 200 também aceita CRON_SECRET como fallback', async () => {
  delete process.env.KEEP_ALIVE_SECRET;
  process.env.CRON_SECRET = SECRET;
  mockOkFetch();

  const res = makeRes();
  await handler(
    makeReq({ headers: { authorization: `Bearer ${SECRET}` } }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
});

test('GET /api/keep-alive → 503 sem secret configurado', async () => {
  delete process.env.KEEP_ALIVE_SECRET;
  delete process.env.CRON_SECRET;

  const res = makeRes();
  await handler(
    makeReq({ headers: { authorization: `Bearer ${SECRET}` } }),
    res,
  );

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.success, false);
});

test('GET /api/keep-alive → 405 para método não permitido', async () => {
  mockOkFetch();
  const res = makeRes();
  await handler(
    makeReq({ method: 'POST', headers: { authorization: `Bearer ${SECRET}` } }),
    res,
  );

  assert.equal(res.statusCode, 405);
});

test('GET /api/keep-alive → 500 com erro do Supabase', async () => {
  installFetch(async (url, init) => {
    calls.push({ url, init });
    const method = init?.method ?? 'GET';
    if (method === 'POST') throw new Error('Erro de conexão com Supabase');
    if (method === 'DELETE') return jsonResponse([], 204);
    return jsonResponse([]);
  });

  const res = makeRes();
  await handler(
    makeReq({ headers: { authorization: `Bearer ${SECRET}` } }),
    res,
  );

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.status, 'error');
  assert.match(res.body.error, /Erro de conexão/);
});