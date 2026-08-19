import type { Req, Res } from '../lib/http';

export function makeReq(overrides: Partial<Req> = {}): Req {
  return {
    method: 'GET',
    headers: {},
    query: {},
    ...overrides,
  };
}

export interface TestRes extends Res {
  statusCode: number;
  body: any;
}

export function makeRes(): TestRes {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const originalFetch = globalThis.fetch;

export function installFetch(
  mock: (url: string, init?: RequestInit) => Promise<Response> | Response,
): void {
  globalThis.fetch = mock as typeof fetch;
}

export function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}