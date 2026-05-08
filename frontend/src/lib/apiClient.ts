/**
 * Cliente HTTP para o backend Node.js (API de leads).
 * Injeta automaticamente a API key em todos os requests.
 */

const BASE = import.meta.env.VITE_API_URL ?? '';
const API_KEY = import.meta.env.VITE_BACKEND_API_KEY ?? '';

function headers(extra: HeadersInit = {}): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
    ...extra,
  };
}

export const apiClient = {
  get(path: string): Promise<Response> {
    return fetch(`${BASE}${path}`, { headers: headers() });
  },

  post(path: string, body: unknown): Promise<Response> {
    return fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
  },

  /** SSE — retorna o Response bruto para leitura do stream */
  stream(path: string, body: unknown): Promise<Response> {
    return fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
  },
};
