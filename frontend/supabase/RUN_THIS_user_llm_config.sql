-- ============================================================
-- Cole e execute este SQL no Supabase (SQL Editor) para criar
-- a tabela de configuração de IA por usuário.
-- ============================================================

-- Função para atualizar updated_at (pode já existir)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Tabela de configuração de IA (chave API, provedor, modelo)
CREATE TABLE IF NOT EXISTS public.user_llm_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'gemini' CHECK (provider IN ('gemini', 'openai')),
  api_key TEXT,
  model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_llm_config ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (remove antes de criar, para não dar erro se rodar de novo)
DROP POLICY IF EXISTS "Users can view own llm config" ON public.user_llm_config;
DROP POLICY IF EXISTS "Users can insert own llm config" ON public.user_llm_config;
DROP POLICY IF EXISTS "Users can update own llm config" ON public.user_llm_config;
DROP POLICY IF EXISTS "Users can delete own llm config" ON public.user_llm_config;

CREATE POLICY "Users can view own llm config"
ON public.user_llm_config FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own llm config"
ON public.user_llm_config FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own llm config"
ON public.user_llm_config FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own llm config"
ON public.user_llm_config FOR DELETE USING (auth.uid() = user_id);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_user_llm_config_updated_at ON public.user_llm_config;
CREATE TRIGGER update_user_llm_config_updated_at
BEFORE UPDATE ON public.user_llm_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
