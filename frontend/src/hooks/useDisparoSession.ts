import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';

const BACKEND_URL    = import.meta.env.VITE_API_URL as string;
const BACKEND_API_KEY = import.meta.env.VITE_BACKEND_API_KEY as string;

const POLL_INTERVAL_MS = 5000; // 5 segundos

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface BatchContact {
  empresa:      string;
  telefone:     string;
  mensagem?:    string;   // opcional — se omitido, o backend gera via IA (1 template por 10 contatos)
  intervalo_ms: number;   // intervalo após este envio, em ms
}

export interface DisparoSession {
  id:            string;
  user_id:       string;
  instance_name: string;
  mensagem_base: string;
  status:        'running' | 'completed' | 'cancelled' | 'failed';
  total:         number;
  sent:          number;
  errors:        number;
  created_at:    string;
  updated_at:    string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDisparoSession() {
  const { user } = useAuth();
  const [activeSession, setActiveSession] = useState<DisparoSession | null>(null);
  const [isStarting, setIsStarting]       = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key':    BACKEND_API_KEY || '',
  };

  /** Consulta o backend por sessão ativa (running) ou recente (completed/cancelled) do usuário. */
  const checkActive = useCallback(async () => {
    if (!user?.id || !BACKEND_URL) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/disparo/active?user_id=${user.id}`, { headers });
      if (!res.ok) return;
      const data = await res.json() as { active: boolean; session?: DisparoSession };

      if (data.active && data.session) {
        // Sessão running — seta estado. O useEffect abaixo inicia o polling.
        setActiveSession(data.session);
      } else if (data.session) {
        // Sessão recente (completed/cancelled) — exibe resumo ao reabrir, sem iniciar polling.
        setActiveSession((prev) => prev ?? data.session!);
      } else {
        // Sem nenhuma sessão relevante: se havia running local, marca como concluída.
        setActiveSession((prev) =>
          prev?.status === 'running' ? { ...prev, status: 'completed' } : prev
        );
      }
    } catch {
      // Falha silenciosa — backend pode estar temporariamente indisponível
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(checkActive, POLL_INTERVAL_MS);
  }, [checkActive]);

  // Verifica sessão ativa ao montar e quando o usuário loga
  useEffect(() => {
    checkActive();
  }, [checkActive]);

  // Inicia/para polling conforme status da sessão
  useEffect(() => {
    if (activeSession?.status === 'running') {
      startPolling();
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [activeSession?.status, startPolling]);

  /**
   * Envia o batch de contatos para o backend iniciar a sessão de disparo.
   * O backend persiste e processa independente do browser.
   *
   * @param llmConfig - Config de IA do usuário. Quando fornecida e os contatos não trazem
   *   mensagem pré-gerada, o backend gera templates automaticamente (1 por 10 contatos).
   * @returns session_id ou null em caso de erro
   */
  const startSession = useCallback(async (
    contacts:     BatchContact[],
    instanceName: string,
    mensagemBase: string,
    llmConfig?:   { provider: string; apiKey: string | null; model: string } | null,
  ): Promise<string | null> => {
    if (!user?.id || !BACKEND_URL) return null;

    setIsStarting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/disparo/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id:       user.id,
          instance_name: instanceName,
          mensagem_base: mensagemBase,
          llm_config:    llmConfig ?? null,
          contacts,
        }),
      });

      const data = await res.json() as { session_id?: string; error?: string };

      if (!res.ok || !data.session_id) {
        console.error('[disparo] Erro ao iniciar sessão:', data.error);
        return null;
      }

      // Puxa o estado imediatamente após criar
      await checkActive();
      startPolling();

      return data.session_id;
    } catch (err) {
      console.error('[disparo] Erro de rede ao iniciar sessão:', err);
      return null;
    } finally {
      setIsStarting(false);
    }
  }, [user?.id, checkActive, startPolling]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Cancela a sessão ativa.
   */
  const cancelSession = useCallback(async (sessionId: string): Promise<void> => {
    if (!BACKEND_URL) return;

    try {
      await fetch(`${BACKEND_URL}/api/disparo/${sessionId}/cancel`, {
        method: 'POST',
        headers,
      });
      // Atualiza estado local imediatamente para não esperar o próximo poll
      setActiveSession((prev) =>
        prev ? { ...prev, status: 'cancelled' } : null
      );
      stopPolling();
    } catch (err) {
      console.error('[disparo] Erro ao cancelar sessão:', err);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Descarta o snapshot da sessão concluída/cancelada do estado local. */
  const dismissSession = useCallback(() => {
    setActiveSession(null);
  }, []);

  return {
    activeSession,
    isStarting,
    startSession,
    cancelSession,
    dismissSession,
    refreshSession: checkActive,
  };
}
