import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { LLMConfig, LLMProvider } from '@/types/llm';
import { DatabaseError, getErrorMessage, getErrorDetails } from '@/lib/errors';

export function useLLMConfig() {
  const { user } = useAuth();
  const [config, setConfig] = useState<LLMConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!user) {
      setConfig(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_llm_config')
        .select('provider, api_key, model')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching LLM config:', getErrorDetails(error));
        setConfig(null);
        return;
      }
      if (data) {
        setConfig({
          provider: (data.provider as LLMProvider) || 'gemini',
          apiKey: data.api_key ?? null,
          model: data.model || 'gemini-2.5-flash',
        });
      } else {
        setConfig(null);
      }
    } catch (err) {
      console.error('Unexpected error fetching LLM config:', err);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = useCallback(
    async (newConfig: { provider: LLMProvider; apiKey: string | null; model: string }) => {
      if (!user) {
        throw new DatabaseError('Usuário não autenticado');
      }

      const row = {
        user_id: user.id,
        provider: newConfig.provider,
        api_key: newConfig.apiKey || null,
        model: newConfig.model,
      };

      const { error } = await supabase
        .from('user_llm_config')
        .upsert(row, { onConflict: 'user_id' });

      if (error) {
        throw new DatabaseError(
          `Erro ao salvar configuração: ${getErrorMessage(error)}`,
          error
        );
      }

      setConfig({
        provider: newConfig.provider,
        apiKey: newConfig.apiKey,
        model: newConfig.model,
      });
    },
    [user]
  );

  return { config, loading, saveConfig, refreshConfig: fetchConfig };
}
