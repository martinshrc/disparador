-- Tabela de histórico de disparos
CREATE TABLE public.dispatch_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  empresa TEXT NOT NULL,
  telefone TEXT NOT NULL,
  mensagem_base TEXT NOT NULL,
  mensagem_ia TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice para performance
CREATE INDEX idx_dispatch_history_user_created ON public.dispatch_history(user_id, created_at DESC);

-- Habilitar RLS
ALTER TABLE public.dispatch_history ENABLE ROW LEVEL SECURITY;

-- Políticas: cada usuário só vê/manipula seus próprios registros
CREATE POLICY "Users can view their own dispatch history"
ON public.dispatch_history
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dispatch history"
ON public.dispatch_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dispatch history"
ON public.dispatch_history
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dispatch history"
ON public.dispatch_history
FOR DELETE
USING (auth.uid() = user_id);