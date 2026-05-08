/**
 * Cliente HTTP para o backend Node.js (API de leads).
 * Passa a API key como query param para evitar preflight CORS.
 */

const BASE = import.meta.env.VITE_API_URL ?? '';
const API_KEY = import.meta.env.VITE_BACKEND_API_KEY ?? '';

function withKey(path: string): string {
  if (!API_KEY) return `${BASE}${path}`;
  const sep = path.includes('?') ? '&' : '?';
  return `${BASE}${path}${sep}apikey=${API_KEY}`;
}

export const apiClient = {
  get(path: string): Promise<Response> {
    return fetch(withKey(path));
  },

  post(path: string, body: unknown): Promise<Response> {
    return fetch(withKey(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  /** SSE — retorna o Response bruto para leitura do stream */
  stream(path: string, body: unknown): Promise<Response> {
    return fetch(withKey(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },
};
