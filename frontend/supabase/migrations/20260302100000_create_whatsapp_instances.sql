-- Tabela de instâncias WhatsApp (Evolution API) por usuário
CREATE TABLE public.whatsapp_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'creating',
  qrcode_base64 TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(instance_name)
);

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own whatsapp_instances"
ON public.whatsapp_instances FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own whatsapp_instances"
ON public.whatsapp_instances FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own whatsapp_instances"
ON public.whatsapp_instances FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own whatsapp_instances"
ON public.whatsapp_instances FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_whatsapp_instances_updated_at
BEFORE UPDATE ON public.whatsapp_instances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
