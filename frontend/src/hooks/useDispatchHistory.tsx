import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { apiClient } from '@/lib/apiClient';

export interface DispatchRecord {
  id: string;
  empresa: string;
  cnpj: string | null;
  telefone: string;
  mensagem_base: string;
  mensagem_ia: string | null;
  instance_name: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export function useDispatchHistory() {
  const [history, setHistory] = useState<DispatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchHistory = useCallback(async () => {
    if (!user) {
      setHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.get(
        `/api/dispatch/history?user_id=${encodeURIComponent(user.id)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DispatchRecord[] = await res.json();
      setHistory(data || []);
    } catch (err) {
      console.error('Erro ao buscar histórico de disparos:', err);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return {
    history,
    loading,
    refreshHistory: fetchHistory,
  };
}
