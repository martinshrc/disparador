import { useState, useCallback, useRef, useEffect } from 'react';
import { MessageCircle, Plus, Trash2, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useWhatsAppInstances, type WhatsAppInstance } from '@/hooks/useWhatsAppInstances';
import { reloadPreservingScroll } from '@/lib/utils';

const N8N_SECRET = import.meta.env.VITE_N8N_WEBHOOK_SECRET as string | undefined;
function n8nHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (N8N_SECRET) h['x-webhook-secret'] = N8N_SECRET;
  return h;
}

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 120; // ~6 min
/** Cooldown do botão Verificar conexão (ms). */
const VERIFY_COOLDOWN_MS = 30_000;
/** Timeout da requisição de criar instância (2 min 10 s). */
const CREATE_QR_TIMEOUT_MS = 130000;
const QR_VALIDITY_MINUTES = 2;
const INSTANCE_NAME_MAX_LENGTH = 30;
/** Nome da instância: só letras, números, no máximo um @ e um . (ex.: email). */
function isValidInstanceName(name: string): boolean {
  if (name.length === 0 || name.length > INSTANCE_NAME_MAX_LENGTH) return false;
  const atCount = (name.match(/@/g) ?? []).length;
  const dotCount = (name.match(/\./g) ?? []).length;
  if (atCount > 1 || dotCount > 1) return false;
  return /^[a-zA-Z0-9@.]+$/.test(name);
}

export function WhatsAppConnector() {
  const { toast } = useToast();
  const { user } = useAuth();
  const {
    instances,
    loading,
    insertInstance,
    updateInstance,
    deleteInstance,
    refreshInstances,
    webhookUrls,
  } = useWhatsAppInstances();
  const [instanceName, setInstanceName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pollingId, setPollingId] = useState<string | null>(null);
  /** QR Code exibido em destaque assim que o webhook retorna (antes da lista atualizar). */
  const [pendingQr, setPendingQr] = useState<{ instanceName: string; base64: string } | null>(null);
  const [verifyCooldown, setVerifyCooldown] = useState(0);
  const pollAttempts = useRef(0);

  useEffect(() => {
    if (verifyCooldown <= 0) return;
    const t = setInterval(() => setVerifyCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [verifyCooldown]);

  const createInstance = useCallback(async () => {
    const raw = instanceName.trim();
    const name = raw.toLowerCase().replace(/[\s_]/g, '');
    if (!name) {
      toast({
        title: 'Nome inválido',
        description: 'Informe um nome para identificar seu WhatsApp (ex: meuwhatsapp ou email@exemplo.com).',
        variant: 'destructive',
      });
      return;
    }
    if (!isValidInstanceName(name)) {
      toast({
        title: 'Nome inválido',
        description: `Máximo ${INSTANCE_NAME_MAX_LENGTH} caracteres; só letras, números e no máximo um @ e um ponto.`,
        variant: 'destructive',
      });
      return;
    }
    if (!webhookUrls.CREATE_URL) {
      toast({
        title: 'Configuração faltando',
        description: 'Serviço de conexão não configurado.',
        variant: 'destructive',
      });
      return;
    }
    setCreating(true);
    let row: WhatsAppInstance | null = null;
    try {
      row = await insertInstance(name);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CREATE_QR_TIMEOUT_MS);
      const res = await fetch(webhookUrls.CREATE_URL, {
        method: 'POST',
        headers: n8nHeaders(),
        body: JSON.stringify({
          instanceName: name,
          user_id: row.user_id,
          email: user?.email ?? undefined,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      if (data.status === 'Sucess' && typeof data.mensagem === 'string') {
        await updateInstance(row.id, {
          status: 'qrcode_pending',
          qrcode_base64: data.mensagem,
        });
        setInstanceName('');
        setPollingId(row.id);
        pollAttempts.current = 0;
        setPendingQr({ instanceName: name, base64: data.mensagem });
        toast({
          title: 'QR Code gerado',
          description: `Escaneie com o WhatsApp no celular. O QR Code é válido por no máximo ${QR_VALIDITY_MINUTES} minutos.`,
        });
        reloadPreservingScroll();
      } else {
        await updateInstance(row.id, { status: 'error' });
        toast({
          title: 'Erro ao conectar WhatsApp',
          description: data.mensagem || res.statusText || 'Resposta inválida do servidor.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      const isTimeout = err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'));
      if (row && isTimeout) {
        try {
          await updateInstance(row.id, { status: 'error' });
        } catch {
          // ignore
        }
        toast({
          title: 'Tempo esgotado',
          description: `O tempo para gerar o QR Code esgotou (máx. ${QR_VALIDITY_MINUTES} min). Se você ainda não escaneou, clique em Criar novamente para gerar um novo código.`,
          variant: 'destructive',
          duration: 8000,
        });
      } else {
        const msg = err instanceof Error ? err.message : 'Erro ao conectar WhatsApp.';
        toast({
          title: 'Erro',
          description: msg,
          variant: 'destructive',
        });
      }
    } finally {
      setCreating(false);
    }
  }, [instanceName, user?.email, webhookUrls.CREATE_URL, insertInstance, updateInstance, toast]);

  const pollStatus = useCallback(
    async (inst: WhatsAppInstance, fromButton = false) => {
      if (!webhookUrls.CHECK_STATUS_URL) return;
      if (fromButton) setVerifyCooldown(30);
      try {
        const res = await fetch(webhookUrls.CHECK_STATUS_URL, {
          method: 'POST',
          headers: n8nHeaders(),
          body: JSON.stringify({ instanceName: inst.instance_name }),
        });
        const data = await res.json().catch(() => ({}));
        const msg = (data.mensagem ?? '').toLowerCase();
        const isSuccess =
          (data.status === 'Sucess' || data.status === 'Success') &&
          (msg.includes('sucesso') || msg.includes('conexão feita') || msg.includes('conectado'));
        if (isSuccess) {
          await updateInstance(inst.id, { status: 'open', qrcode_base64: null });
          setPollingId(null);
          setPendingQr(null);
          toast({
            title: 'Conexão feita com sucesso!',
            description: 'WhatsApp conectado.',
          });
          reloadPreservingScroll();
          return;
        }
      } catch {
        // ignore single poll errors
      }
      if (fromButton) reloadPreservingScroll();
    },
    [webhookUrls.CHECK_STATUS_URL, updateInstance, toast]
  );

  useEffect(() => {
    if (!pollingId) return;
    const inst = instances.find((i) => i.id === pollingId);
    if (!inst || inst.status === 'open') {
      setPollingId(null);
      return;
    }
    if (pollAttempts.current >= POLL_MAX_ATTEMPTS) {
      setPollingId(null);
      toast({
        title: 'Tempo esgotado',
        description: 'Polling de status encerrado. Atualize o QR se necessário.',
        variant: 'destructive',
      });
      return;
    }
    const t = setInterval(() => {
      pollAttempts.current += 1;
      pollStatus(inst);
    }, POLL_INTERVAL_MS);
    pollStatus(inst, false);
    return () => clearInterval(t);
  }, [pollingId, instances, pollStatus, toast]);

  const handleDelete = useCallback(
    async (inst: WhatsAppInstance) => {
      if (!webhookUrls.DELETE_URL) {
        toast({
          title: 'Configuração faltando',
          description: 'Serviço de remoção não configurado.',
          variant: 'destructive',
        });
        return;
      }
      setDeletingId(inst.id);
      try {
        await fetch(webhookUrls.DELETE_URL, {
          method: 'POST',
          headers: n8nHeaders(),
          body: JSON.stringify({ instanceName: inst.instance_name }),
        });
        await deleteInstance(inst.id);
        if (pendingQr?.instanceName === inst.instance_name) setPendingQr(null);
        toast({
          title: 'WhatsApp desconectado',
          description: 'O WhatsApp foi desconectado e removido.',
        });
        reloadPreservingScroll();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao remover.';
        toast({
          title: 'Erro ao remover',
          description: msg,
          variant: 'destructive',
        });
      } finally {
        setDeletingId(null);
      }
    },
    [webhookUrls.DELETE_URL, deleteInstance, toast, pendingQr?.instanceName]
  );

  const refreshQr = useCallback(
    async (inst: WhatsAppInstance) => {
      if (!webhookUrls.QRCODE_URL || inst.status !== 'qrcode_pending') return;
      try {
        const res = await fetch(webhookUrls.QRCODE_URL, {
          method: 'POST',
          headers: n8nHeaders(),
          body: JSON.stringify({ instanceName: inst.instance_name }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.status === 'Sucess' && typeof data.mensagem === 'string') {
          await updateInstance(inst.id, { qrcode_base64: data.mensagem });
          toast({ title: 'QR Code atualizado', description: 'Escaneie o novo código.' });
          reloadPreservingScroll();
        }
      } catch {
        toast({
          title: 'Erro ao atualizar QR',
          variant: 'destructive',
        });
      }
    },
    [webhookUrls.QRCODE_URL, updateInstance, toast]
  );

  const statusBadge = (status: string) => {
    const v = status === 'open' ? 'default' : status === 'error' ? 'destructive' : 'secondary';
    const label =
      status === 'open'
        ? 'Conectado'
        : status === 'qrcode_pending'
          ? 'Aguardando QR'
          : status === 'creating'
            ? 'Criando'
            : status;
    return <Badge variant={v}>{label}</Badge>;
  };

  return (
    <Card className="glass-card border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 flex-wrap">
          <MessageCircle className="h-5 w-5" />
          Conector WhatsApp
          <Badge variant="secondary" className="text-xs font-normal">Passo 1</Badge>
        </CardTitle>
        <CardDescription>
          Conecte seu WhatsApp para poder enviar mensagens. Crie uma conexão e escaneie o QR Code no celular.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-[200px] space-y-2">
            <Label htmlFor="instance-name">Nome do WhatsApp</Label>
            <Input
              id="instance-name"
              placeholder="ex: meuwhatsapp ou email@exemplo.com"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value.slice(0, INSTANCE_NAME_MAX_LENGTH))}
              maxLength={INSTANCE_NAME_MAX_LENGTH}
              disabled={creating}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={createInstance} disabled={creating}>
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" />
                  Criar
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Área em destaque para o QR Code (visível assim que é gerado) */}
        {(pendingQr || instances.some((i) => i.status === 'qrcode_pending' && i.qrcode_base64)) && (() => {
          const pendingInst = instances.find((i) => i.status === 'qrcode_pending');
          return (
            <div className="rounded-lg border bg-muted/30 p-4 text-center">
              <p className="text-sm font-medium mb-2">QR Code gerado</p>
              <p className="text-xs text-muted-foreground mb-1">Escaneie com o WhatsApp no celular para conectar.</p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mb-3">
                Este QR Code é válido por no máximo {QR_VALIDITY_MINUTES} minutos. Após isso, use &quot;Novo QR&quot; para gerar outro.
              </p>
              <div className="flex justify-center">
                <img
                  src={`data:image/png;base64,${pendingQr?.base64 ?? pendingInst?.qrcode_base64}`}
                  alt="QR Code WhatsApp"
                  className="max-w-[220px] w-full rounded-lg border-2 border-border shadow-sm"
                />
              </div>
            </div>
          );
        })()}

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando conexões WhatsApp…
          </div>
        ) : instances.length === 0 && !pendingQr ? (
          <p className="text-sm text-muted-foreground">
            Nenhum WhatsApp conectado ainda. Conecte acima para gerar o QR Code.
          </p>
        ) : instances.length > 0 ? (
          <ul className="space-y-3">
            {instances.map((inst) => (
              <li
                key={inst.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{inst.instance_name}</span>
                  {statusBadge(inst.status)}
                  {inst.status === 'open' && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {inst.status === 'qrcode_pending' && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={verifyCooldown > 0}
                        onClick={() => pollStatus(inst, true)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        {verifyCooldown > 0 ? `Verificar conexão (${verifyCooldown}s)` : 'Verificar conexão'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => refreshQr(inst)}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Novo QR
                      </Button>
                    </>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(inst)}
                    disabled={deletingId === inst.id}
                  >
                    {deletingId === inst.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
