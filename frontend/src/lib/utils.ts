import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Remove não-dígitos e adiciona 55 se não tiver código do país. */
export function normalizePhone(phone: string): string {
  const cleaned = String(phone).replace(/\D/g, "");
  if (!cleaned.startsWith("55")) {
    return "55" + cleaned;
  }
  return cleaned;
}

/** Valida telefone: após normalizar, deve ter pelo menos 12 dígitos (55 + DDD + número). */
export function validatePhone(phone: string): { valid: boolean; normalized?: string; error?: string } {
  const normalized = normalizePhone(phone);
  if (normalized.length < 12) {
    return {
      valid: false,
      error: "Telefone inválido. Informe DDD + número (ex.: 11 99999-9999).",
    };
  }
  if (normalized.length > 13) {
    return {
      valid: false,
      error: "Telefone inválido. Número muito longo.",
    };
  }
  return { valid: true, normalized };
}

const RELOAD_SCROLL_KEY = 'disparador_reload_scroll';

/** Salva a posição do scroll e recarrega a página; após o load, use restoreScrollAfterReload(). */
export function reloadPreservingScroll(): void {
  try {
    sessionStorage.setItem(RELOAD_SCROLL_KEY, JSON.stringify({ x: window.scrollX, y: window.scrollY }));
  } catch {
    // ignore
  }
  window.location.reload();
}

/** Restaura a posição do scroll após um reload feito com reloadPreservingScroll(). Chamar uma vez no mount da app. */
export function restoreScrollAfterReload(): void {
  try {
    const raw = sessionStorage.getItem(RELOAD_SCROLL_KEY);
    if (!raw) return;
    sessionStorage.removeItem(RELOAD_SCROLL_KEY);
    const { x = 0, y = 0 } = JSON.parse(raw) as { x?: number; y?: number };
    const scroll = () => window.scrollTo(x, y);
    requestAnimationFrame(() => {
      scroll();
      setTimeout(scroll, 50);
    });
  } catch {
    // ignore
  }
}
