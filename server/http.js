// Utilidades HTTP das Pages Functions.
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function errorResponse(err) {
  if (err instanceof HttpError) return json({ error: err.code, message: err.message }, err.status);
  if (err?.name === 'RuleError') return json({ error: err.code, message: err.message }, 409);
  console.error('nozito_api_error', err?.message ?? err);
  return json({ error: 'INTERNAL', message: 'Algo deu errado. Tente de novo.' }, 500);
}

const MAX_BODY = 4096;

export async function readJson(request) {
  const type = request.headers.get('Content-Type') ?? '';
  if (!type.includes('application/json')) throw new HttpError(415, 'JSON_REQUIRED', 'Envie JSON.');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'BODY_TOO_LARGE', 'Pedido grande demais.');
  try {
    const data = JSON.parse(text || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not object');
    return data;
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'JSON inválido.');
  }
}

/** Envolve um handler: erros viram JSON padronizado. */
export function handle(fn) {
  return async (context) => {
    try {
      return await fn(context);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
