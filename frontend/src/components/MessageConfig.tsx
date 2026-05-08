import { Bot, Key, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useLLMConfig } from '@/hooks/useLLMConfig';
import { PROVIDER_LABELS } from '@/types/llm';

interface MessageConfigProps {
  mensagemBase: string;
  onMensagemChange: (mensagem: string) => void;
  disabled?: boolean;
}

export function MessageConfig({ mensagemBase, onMensagemChange, disabled }: MessageConfigProps) {
  const { config: llmConfig, loading } = useLLMConfig();
  const hasApi = Boolean(llmConfig?.apiKey?.trim());
  const providerLabel = llmConfig?.provider ? PROVIDER_LABELS[llmConfig.provider] : null;

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bot className="h-5 w-5 text-primary" />
          Configuração da Mensagem
        </CardTitle>
        <CardDescription>
          A IA vai variar esta mensagem para cada empresa
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder="Digite sua mensagem base aqui... Ex: Olá! Gostaria de apresentar nossos serviços para sua empresa."
          value={mensagemBase}
          onChange={(e) => onMensagemChange(e.target.value)}
          disabled={disabled}
          className="min-h-[120px] resize-none text-sm"
        />

        {loading ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
            <Key className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Verificando configuração de IA...</span>
          </div>
        ) : hasApi ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-success" />
              <span className="text-sm text-foreground">
                {providerLabel ?? 'API'} · {llmConfig?.model ?? ''}
              </span>
            </div>
            <Badge variant="outline" className="ml-auto bg-success/10 text-success border-success/30">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Configurada
            </Badge>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-foreground">API não configurada</span>
            <Badge variant="outline" className="ml-auto bg-destructive/10 text-destructive border-destructive/30">
              Configure em &quot;Configurações de IA&quot;
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
