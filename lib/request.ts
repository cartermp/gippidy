export const PRIVATE_NO_STORE = 'private, no-store';

function mergeHeaders(...headerSets: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();
  for (const set of headerSets) {
    if (!set) continue;
    const next = new Headers(set);
    next.forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

export function getRequestId(req: Request): string {
  const existing = req.headers.get('x-request-id')?.trim();
  return existing || crypto.randomUUID();
}

export function readContentLength(req: Request): number | null {
  const raw = req.headers.get('content-length');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function jsonResponse(
  data: unknown,
  init: ResponseInit = {},
  options: { requestId?: string; cacheControl?: string } = {},
): Response {
  const headers = mergeHeaders(init.headers, {
    ...(options.requestId ? { 'X-Request-Id': options.requestId } : {}),
    ...(options.cacheControl ? { 'Cache-Control': options.cacheControl } : {}),
  });
  return Response.json(data, { ...init, headers });
}

export function textResponse(
  body: BodyInit | null,
  init: ResponseInit = {},
  options: { requestId?: string; cacheControl?: string } = {},
): Response {
  const headers = mergeHeaders(init.headers, {
    ...(options.requestId ? { 'X-Request-Id': options.requestId } : {}),
    ...(options.cacheControl ? { 'Cache-Control': options.cacheControl } : {}),
  });
  return new Response(body, { ...init, headers });
}
