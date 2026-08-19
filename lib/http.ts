export interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string>;
}

export interface Res {
  status(code: number): Res;
  json(body: unknown): void;
}

export interface Handler {
  (req: Req, res: Res): Promise<unknown> | unknown;
}

export function sendJson(res: Res, status: number, body: unknown): void {
  res.status(status).json(body);
}