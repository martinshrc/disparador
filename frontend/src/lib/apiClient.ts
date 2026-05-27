/**
 * Cliente HTTP para o backend Node.js.
 * Passa a API key como query param para evitar preflight CORS em GET/DELETE simples.
 */

const BASE = import.meta.env.VITE_API_URL ?? '';
const API_KEY = import.meta.env.VITE_BACKEND_API_KEY ?? '';

function withKey(path: string): string {
  if (!API_KEY) return `${BASE}${path}`;
  const sep = path.includes('?') ? '&' : '?';
  return `${BASE}${path}${sep}apikey=${API_KEY}`;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const apiClient = {
  get(path: string): Promise<Response> {
    return fetch(withKey(path));
  },

  post(path: string, body: unknown): Promise<Response> {
    return fetch(withKey(path), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
  },

  put(path: string, body: unknown): Promise<Response> {
    return fetch(withKey(path), {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
  },

  patch(path: string, body: unknown): Promise<Response> {
    return fetch(withKey(path), {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
  },

  delete(path: string): Promise<Response> {
    return fetch(withKey(path), { method: 'DELETE' });
  },

  /** SSE — retorna o Response bruto para leitura do stream */
  stream(path: string, body: unknown): Promise<Response> {
    return fetch(withKey(path), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
  },
};
