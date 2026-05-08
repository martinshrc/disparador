import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { DatabaseError, getErrorMessage, getErrorDetails } from '@/lib/errors';
import { withRetry, RetryConfigs } from '@/lib/retry';

export interface DispatchRecord {
  id: string;
  empresa: string;
  telefone: string;
  mensagem_base: string;
  mensagem_ia: string | null;
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
      const { data, error } = await supabase
        .from('dispatch_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        const errorDetails = getErrorDetails(error);
        console.error('Error fetching dispatch history:', errorDetails);
        setHistory([]);
      } else {
        setHistory(data || []);
      }
    } catch (error) {
      const errorDetails = getErrorDetails(error);
      console.error('Unexpected error fetching dispatch history:', errorDetails);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const saveDispatch = async (record: {
    empresa: string;
    telefone: string;
    mensagem_base: string;
    mensagem_ia: string | null;
    status: string;
    error_message?: string | null;
  }) => {
    if (!user) {
      console.warn('Attempted to save dispatch without user');
      return null;
    }

    if (!record.empresa || !record.telefone || !record.mensagem_base) {
      console.warn('Attempted to save dispatch with invalid data:', record);
      return null;
    }

    const retryResult = await withRetry(
      async () => {
        const { data, error } = await supabase
          .from('dispatch_history')
          .insert({
            user_id: user.id,
            empresa: record.empresa.trim(),
            telefone: record.telefone.trim(),
            mensagem_base: record.mensagem_base.trim(),
            mensagem_ia: record.mensagem_ia?.trim() || null,
            status: record.status,
            error_message: record.error_message?.trim() || null,
          })
          .select()
          .single();

        if (error) {
          throw new DatabaseError(`Erro ao salvar histórico: ${getErrorMessage(error)}`, error);
        }

        return data;
      },
      {
        ...RetryConfigs.database,
        maxAttempts: 2,
        onRetry: (attempt, error) => {
          console.warn(`Tentativa ${attempt} falhou, tentando novamente...`, error);
        },
      }
    );

    if (!retryResult.success) {
      const errorDetails = getErrorDetails(retryResult.lastError);
      console.error('Error saving dispatch após todas as tentativas:', errorDetails);
      return null;
    }

    fetchHistory().catch(err => {
      console.error('Error refreshing history after save:', err);
    });

    return retryResult.data || null;
  };

  return {
    history,
    loading,
    saveDispatch,
    refreshHistory: fetchHistory,
  };
}
