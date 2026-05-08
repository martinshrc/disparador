-- Configuração de IA por usuário: API key, provedor (Gemini/OpenAI) e modelo
CREATE TABLE public.user_llm_config (
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

CREATE TRIGGER update_user_llm_config_updated_at
BEFORE UPDATE ON public.user_llm_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
