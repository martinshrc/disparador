import { useState, useEffect } from 'react';
import { KeyRound } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLLMConfig } from '@/hooks/useLLMConfig';
import { useToast } from '@/hooks/use-toast';
import type { LLMProvider } from '@/types/llm';
import {
  GEMINI_MODELS,
  OPENAI_MODELS,
  PROVIDER_LABELS,
  DEFAULT_LLM_CONFIG,
} from '@/types/llm';

interface LLMConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LLMConfigDialog({ open, onOpenChange }: LLMConfigDialogProps) {
  const { config, loading, saveConfig } = useLLMConfig();
  const { toast } = useToast();
  const [provider, setProvider] = useState<LLMProvider>(DEFAULT_LLM_CONFIG.provider);
  const [model, setModel] = useState(DEFAULT_LLM_CONFIG.model);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProvider(config?.provider ?? DEFAULT_LLM_CONFIG.provider);
    setModel(config?.model ?? DEFAULT_LLM_CONFIG.model);
    setApiKey(config?.apiKey ?? '');
  }, [open, config?.provider, config?.model, config?.apiKey]);

  useEffect(() => {
    if (provider === 'openai' && !OPENAI_MODELS.some((m) => m.id === model)) {
      setModel('gpt-4o-mini');
    }
    if (provider === 'gemini' && !GEMINI_MODELS.some((m) => m.id === model)) {
      setModel('gemini-2.5-flash');
    }
  }, [provider]);

  const models = provider === 'openai' ? OPENAI_MODELS : GEMINI_MODELS;

  const handleSave = async () => {
    if (!apiKey.trim()) {
      toast({
        title: 'Chave de API obrigatória',
        description: 'Cole sua chave de API para usar a geração de mensagens com IA.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      await saveConfig({
        provider,
        apiKey: apiKey.trim(),
        model,
      });
      toast({
        title: 'Configuração salva',
        description: 'Sua chave e modelo de IA foram salvos no seu perfil.',
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao salvar configuração de IA:', error);
      toast({
        title: 'Erro ao salvar',
        description: error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Configurações de IA
          </DialogTitle>
          <DialogDescription>
            Escolha o provedor, o modelo e cole sua chave de API. Os dados são salvos no seu perfil.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-6 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="provider">Provedor (LLM)</Label>
              <Select
                value={provider}
                onValueChange={(v) => setProvider(v as LLMProvider)}
              >
                <SelectTrigger id="provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">{PROVIDER_LABELS.gemini}</SelectItem>
                  <SelectItem value="openai">{PROVIDER_LABELS.openai}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="model">Modelo</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="apiKey">Chave de API</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder={
                  provider === 'gemini'
                    ? 'Sua chave do Google AI Studio (Gemini)'
                    : 'Sua chave da OpenAI'
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {provider === 'gemini'
                  ? 'Obtenha em: aistudio.google.com/apikey'
                  : 'Obtenha em: platform.openai.com/api-keys'}
              </p>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full mt-2">
              {saving ? 'Salvando...' : 'Salvar no meu perfil'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
