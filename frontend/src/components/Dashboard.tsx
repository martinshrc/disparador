import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Square, Users, CheckCircle2, XCircle, LogOut, History, KeyRound, ListOrdered, Search, Loader2, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { FileUpload } from './FileUpload';
import { MessageConfig } from './MessageConfig';
import { ContactsTable } from './ContactsTable';
import { CountdownTimer } from './CountdownTimer';
import { LLMConfigDialog } from './LLMConfigDialog';
import { WhatsAppConnector } from './WhatsAppConnector';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ContactRow } from '@/types/dispatcher';
import { type FilterType } from '@/components/ContactsTable';
import { cn } from '@/lib/utils';
import { generateAIMessage, getRandomDelay, DISPATCH_DELAY_MIN_LIMIT, DISPATCH_DELAY_MAX_LIMIT } from '@/lib/api';
import { normalizePhone } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useDispatchHistory } from '@/hooks/useDispatchHistory';
import { useContacts } from '@/hooks/useContacts';
import { useLLMConfig } from '@/hooks/useLLMConfig';
import { useWhatsAppInstances } from '@/hooks/useWhatsAppInstances';
import { useDisparoSession, type BatchContact } from '@/hooks/useDisparoSession';

export function Dashboard() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [mensagemBase, setMensagemBase] = useState('');
  const [savingContactsToProfile, setSavingContactsToProfile] = useState(false);
  const [llmConfigOpen, setLLMConfigOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [countdown, setCountdown] = useState(0);
  const [maxCountdown, setMaxCountdown] = useState(0);
  /** Fase 1 do novo fluxo: geração de mensagens IA antes de enviar ao backend */
  const [isGenerating, setIsGenerating]     = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [generateTotal, setGenerateTotal]   = useState(0);
  const abortGenerateRef = useRef(false);
  const [delayMin, setDelayMin] = useState(() => {
    const v = Number(localStorage.getItem('disparador_delay_min'));
    return Number.isFinite(v) && v >= DISPATCH_DELAY_MIN_LIMIT && v <= DISPATCH_DELAY_MAX_LIMIT ? v : DISPATCH_DELAY_MIN_LIMIT;
  });
  const [delayMax, setDelayMax] = useState(() => {
    const v = Number(localStorage.getItem('disparador_delay_max'));
    return Number.isFinite(v) && v >= DISPATCH_DELAY_MIN_LIMIT && v <= DISPATCH_DELAY_MAX_LIMIT ? v : 25;
  });
  /** Filtros controlados pelo Dashboard para sincronizar com runDispatcher */
  const [dispatchFilter, setDispatchFilter]     = useState<FilterType>('todos');
  const [dispatchSegmento, setDispatchSegmento] = useState<string>('_todos');
  const { toast }    = useToast();
  const { user, signOut } = useAuth();

  /**
   * IDs de contatos excluídos da lista de disparo (persistidos por usuário no localStorage).
   * Os contatos permanecem no Supabase/leads — apenas ficam fora da lista de disparo local.
   * Inicializado de forma síncrona com o user.id já disponível via contexto.
   */
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => {
    if (!user?.id) return new Set<string>();
    try {
      const stored = localStorage.getItem(`disparador_excluded_${user.id}`);
      return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  const addToExcluded = useCallback((ids: string[]) => {
    setExcludedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      if (user?.id) localStorage.setItem(`disparador_excluded_${user.id}`, JSON.stringify([...next]));
      return next;
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    activeSession,
    isStarting,
    startSession,
    cancelSession,
  } = useDisparoSession();
  const { history } = useDispatchHistory();
  const {
    contacts: savedContacts,
    loading: contactsLoading,
    saveContactsFromFile,
  } = useContacts();
  const { config: llmConfig } = useLLMConfig();
  const { instances: whatsappInstances } = useWhatsAppInstances();
  const navigate = useNavigate();

  /** Instância WhatsApp conectada usada no disparo (primeira com status 'open'). */
  const dispatchInstanceName = whatsappInstances.find((i) => i.status === 'open')?.instance_name;
  const totalEnviados = contacts.filter(c => c.status === 'sucesso').length;
  const totalErros    = contacts.filter(c => c.status === 'erro').length;
  const progress      = contacts.length > 0 ? (totalEnviados + totalErros) / contacts.length * 100 : 0;

  /** Disparo está bloqueado se há sessão rodando no backend ou se está gerando mensagens */
  const isRunning = isGenerating || isStarting || activeSession?.status === 'running';

  /** Contatos que serão efetivamente disparados com o filtro ativo */
  const filteredPendingCount = (() => {
    let c = contacts.filter(r => r.status === 'pendente' || r.status === 'erro');
    if (dispatchFilter === 'primeiro')  c = c.filter(r => !r.jaEnviou);
    if (dispatchFilter === 'ja-enviou') c = c.filter(r => r.jaEnviou);
    if (dispatchSegmento !== '_todos')  c = c.filter(r => r.segmento === dispatchSegmento);
    return c.length;
  })();

  // Ao carregar: se a lista de disparo estiver vazia, preenche com os contatos salvos no perfil
  // IDs em excludedIds (localStorage) são omitidos — o lead continua no Supabase, apenas sai da fila.
  useEffect(() => {
    if (contactsLoading || contacts.length > 0) return;
    if (savedContacts.length > 0) {
      const asContactRows: ContactRow[] = savedContacts
        .filter(c => !excludedIds.has(c.id)) // eslint-disable-line react-hooks/exhaustive-deps
        .map((c) => ({
          id: c.id,
          empresa: c.empresa,
          telefone: c.telefone,
          telefoneFormatado: normalizePhone(c.telefone),
          mensagemIA: c.ultima_mensagem ?? '',
          status: 'pendente' as const,
          jaEnviou: !!c.ultima_mensagem_data,
        }));
      setContacts(asContactRows);
    }
  }, [contactsLoading, savedContacts, contacts.length]); // excludedIds intencionalmente omitido — carregado síncronamente antes do efeito

  // Aviso ao fechar aba apenas durante a fase de geração de IA (lado cliente).
  // Após o batch estar no backend, fechar o browser é seguro — o servidor continua.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isGenerating) {
        e.preventDefault();
        e.returnValue = 'Ainda gerando mensagens com IA. Aguarde ou as mensagens serão perdidas.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isGenerating]);
  const updateContact = useCallback((id: string, updates: Partial<ContactRow>) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  /**
   * Novo fluxo de disparo em 2 fases:
   *
   * Fase 1 — Geração de IA (client-side, usa chave do usuário):
   *   Gera variações de mensagem para todos os contatos pendentes,
   *   exibindo progresso "X/N" na tela.
   *
   * Fase 2 — Enfileiramento no backend:
   *   Envia o batch completo para o backend via POST /api/disparo/start.
   *   O backend persiste a fila e executa independentemente do browser.
   *   Fechar o site não interrompe os disparos.
   */
  const runDispatcher = async () => {
    if (!dispatchInstanceName) {
      toast({ title: "Conecte um WhatsApp", description: "Use o Conector WhatsApp ao lado para conectar e tente novamente.", variant: "destructive" });
      return;
    }
    if (!mensagemBase.trim()) {
      toast({ title: "Mensagem obrigatória", description: "Digite uma mensagem base antes de iniciar.", variant: "destructive" });
      return;
    }
    // Aplica os mesmos filtros visíveis na tabela — disparo respeita o filtro ativo
    let pendingContacts = contacts.filter(c => c.status === 'pendente' || c.status === 'erro');
    if (dispatchFilter === 'primeiro')   pendingContacts = pendingContacts.filter(c => !c.jaEnviou);
    if (dispatchFilter === 'ja-enviou')  pendingContacts = pendingContacts.filter(c => c.jaEnviou);
    if (dispatchSegmento !== '_todos')   pendingContacts = pendingContacts.filter(c => c.segmento === dispatchSegmento);

    if (pendingContacts.length === 0) {
      const filterLabel = dispatchFilter === 'primeiro' ? '"Primeiro contato"' : dispatchFilter === 'ja-enviou' ? '"Já enviou"' : '';
      const segLabel    = dispatchSegmento !== '_todos' ? ` (segmento: ${dispatchSegmento})` : '';
      toast({
        title: "Nenhum contato pendente",
        description: `Nenhum contato pendente com o filtro ${filterLabel}${segLabel} ativo.`,
      });
      return;
    }

    // ── Fase 1: Geração de mensagens IA ──────────────────────────────────────
    setIsGenerating(true);
    abortGenerateRef.current = false;
    setGenerateProgress(0);
    setGenerateTotal(pendingContacts.length);

    toast({
      title: "Gerando mensagens com IA...",
      description: `Variando mensagem para ${pendingContacts.length} contatos. Aguarde.`,
    });

    const batchContacts: BatchContact[] = [];

    for (let i = 0; i < pendingContacts.length; i++) {
      if (abortGenerateRef.current) break;

      const contact = pendingContacts[i];
      updateContact(contact.id, { status: 'gerando-ia' });

      const aiResult = await generateAIMessage(contact.empresa, mensagemBase, llmConfig ?? null);
      const mensagem = aiResult.message; // fallback para mensagemBase se IA falhar

      updateContact(contact.id, { mensagemIA: mensagem, status: 'pendente' });
      setGenerateProgress(i + 1);

      // Intervalo entre mensagens da fila (pré-calculado por contato)
      const intervalo_ms = getRandomDelay(delayMin, delayMax) * 1000;
      batchContacts.push({
        empresa:      contact.empresa,
        telefone:     contact.telefoneFormatado,
        mensagem,
        intervalo_ms,
      });
    }

    setIsGenerating(false);
    setGenerateProgress(0);
    setGenerateTotal(0);

    if (abortGenerateRef.current || batchContacts.length === 0) return;

    // ── Fase 2: Enfileirar no backend ────────────────────────────────────────
    const sessionId = await startSession(batchContacts, dispatchInstanceName, mensagemBase);

    if (!sessionId) {
      toast({
        title: "Erro ao iniciar disparo",
        description: "Não foi possível conectar ao servidor. Verifique se o backend está rodando.",
        variant: "destructive",
      });
      return;
    }

    // Marca todos como "enviando" — o backend gerencia o status real a partir daqui
    pendingContacts.forEach(c => updateContact(c.id, { status: 'enviando' }));

    toast({
      title: "Disparo iniciado no servidor!",
      description: `${batchContacts.length} mensagens enfileiradas. Pode fechar o site — o processo continua.`,
    });
  };

  const stopDispatcher = () => {
    if (isGenerating) {
      // Cancela a fase de geração de IA (ainda no cliente)
      abortGenerateRef.current = true;
      setIsGenerating(false);
      toast({ title: "Geração cancelada", description: "A geração de mensagens foi interrompida." });
    } else if (activeSession?.status === 'running') {
      // Cancela a sessão no backend
      cancelSession(activeSession.id);
      toast({ title: "Cancelando disparo...", description: "Sinal enviado ao servidor. Pode levar alguns segundos." });
    }
  };
  const handleRetry = (id: string) => {
    updateContact(id, {
      status: 'pendente',
      mensagemIA: '',
      erro: undefined
    });
  };
  const handleRetryAll = () => {
    setContacts(prev => prev.map(c => ({
      ...c,
      status: 'pendente',
      mensagemIA: '',
      erro: undefined
    })));
    toast({
      title: "Contatos resetados",
      description: "Todos os contatos foram marcados como pendentes."
    });
  };

  const handleRemove = (id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    addToExcluded([id]);
  };

  const handleRemoveSelected = (ids: string[]) => {
    const idSet = new Set(ids);
    setContacts(prev => prev.filter(c => !idSet.has(c.id)));
    addToExcluded(ids);
  };

  /** Limpa as exclusões e recarrega a lista completa do Supabase. */
  const handleRestoreAll = () => {
    setExcludedIds(new Set());
    if (user?.id) localStorage.removeItem(`disparador_excluded_${user.id}`);
    setContacts([]); // reseta a lista → o useEffect recarrega do Supabase sem filtros
  };
  const handleFileLoaded = async (newContacts: ContactRow[]) => {
    if (newContacts.length === 0) return;

    setSavingContactsToProfile(true);
    const payload = newContacts.map((c) => ({ empresa: c.empresa, telefone: c.telefoneFormatado }));

    try {
      // Salva primeiro no perfil do usuário (Supabase) no momento do upload
      await saveContactsFromFile(payload);
      setContacts(newContacts);
      toast({
        title: "Contatos salvos no seu perfil",
        description: `${newContacts.length} contatos foram adicionados à sua lista e estão prontos para disparo.`
      });
    } catch (error) {
      console.error("Erro ao salvar contatos no perfil:", error);
      setContacts(newContacts);
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      toast({
        title: "Contatos não foram salvos no perfil",
        description: `${newContacts.length} contatos estão prontos para esta sessão, mas não foi possível gravar no banco. Erro: ${msg}. Confira se as tabelas do Supabase estão criadas (rode as migrations).`,
        variant: "destructive",
        duration: 10000,
      });
    } finally {
      setSavingContactsToProfile(false);
    }
  };
  const handleSignOut = async () => {
    await signOut();
    toast({
      title: "Até logo!",
      description: "Você saiu da sua conta."
    });
  };
  return <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/blitzar-logo.png" alt="Blitzar Labs" className="h-10 object-contain" />
              <div>
                <h1 className="text-xl font-bold text-foreground">Blitzar Labs - Disparador</h1>
                <p className="text-sm text-muted-foreground">Disparos B2B com IA Anti-Bloqueio</p>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 text-sm">
              <div 
                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => navigate('/contacts')}
                title="X na lista de disparo (clique para ver Contatos salvos)"
              >
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{contacts.length}</span>
                <span className="text-muted-foreground">na lista</span>
              </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="font-medium text-success">{totalEnviados}</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="font-medium text-destructive">{totalErros}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 border-l pl-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLLMConfigOpen(true)}
                  disabled={isRunning}
                  className="gap-2"
                  title="Configurações de IA"
                >
                  <KeyRound className="h-4 w-4" />
                  IA
                </Button>
                <span className="text-sm text-muted-foreground truncate max-w-[150px]">
                  {user?.email}
                </span>
                <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={isRunning} className="gap-2">
                  <LogOut className="h-4 w-4" />
                  Sair
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-8">
        {/* Seção 1: Configuração do disparador — tudo à vista */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">Configuração do disparador</h2>
          <div className="grid lg:grid-cols-3 gap-6 items-start">
            {/* Coluna 1: Para começar + WhatsApp */}
            <div className="space-y-6">
              <Card className="glass-card border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ListOrdered className="h-4 w-4 text-primary" />
                    Para começar
                  </CardTitle>
                  <CardDescription>
                    Siga a ordem abaixo. O passo em destaque é o próximo a fazer.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {(() => {
                    const step1 = !!dispatchInstanceName;
                    const step2 = Boolean(llmConfig?.apiKey?.trim());
                    const step3 = contacts.length > 0;
                    const step4 = !!mensagemBase.trim();
                    const currentStep = !step1 ? 1 : !step2 ? 2 : !step3 ? 3 : !step4 ? 4 : 5;
                    const steps = [
                      { n: 1, label: 'WhatsApp', done: step1 },
                      { n: 2, label: 'IA', done: step2 },
                      { n: 3, label: 'Coletar Leads', done: step3 },
                      { n: 4, label: 'Mensagem', done: step4 },
                      { n: 5, label: 'Iniciar', done: false },
                    ];
                    return (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {steps.map((s, i) => (
                          <span key={s.n} className="flex items-center gap-1">
                            <span
                              className={cn(
                                'inline-flex h-6 w-6 items-center justify-center rounded-full font-medium',
                                s.done && 'bg-success/20 text-success',
                                !s.done && currentStep === s.n && 'bg-primary text-primary-foreground ring-2 ring-primary',
                                !s.done && currentStep !== s.n && 'bg-muted text-muted-foreground',
                              )}
                            >
                              {s.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.n}
                            </span>
                            <span className={cn(!s.done && currentStep === s.n && 'font-medium text-foreground')}>
                              {s.label}
                            </span>
                            {i < steps.length - 1 && <span className="text-muted-foreground/50">→</span>}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Conecte seu WhatsApp (card ao lado)</li>
                    <li>Configure a IA (botão &quot;IA&quot; no topo)</li>
                    <li>Use <Link to="/coletar-leads" className="text-primary hover:underline font-medium">Coletar leads</Link> para adicionar contatos</li>
                    <li>Escreva a mensagem base</li>
                    <li>Clique em &quot;Iniciar disparos&quot; no painel ao lado</li>
                  </ol>
                </CardContent>
              </Card>
              <WhatsAppConnector />
            </div>

            {/* Coluna 2: Atalhos + Upload + Mensagem */}
            <div className="space-y-6">
              <Card className="glass-card">
                <CardContent className="pt-4 space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => setLLMConfigOpen(true)}
                  >
                    <KeyRound className="h-4 w-4" />
                    Configurações de IA
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => navigate('/contacts')}
                  >
                    <Users className="h-4 w-4" />
                    Contatos Salvos
                    <span className="ml-auto text-muted-foreground text-sm">{savedContacts.length}</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => navigate('/history')}
                  >
                    <History className="h-4 w-4" />
                    Histórico de Envios
                    <span className="ml-auto text-muted-foreground text-sm">{history.length}</span>
                  </Button>
                  <Button
                    className="w-full justify-start gap-2 gradient-primary shadow-glow hover:shadow-lg transition-all"
                    onClick={() => navigate('/coletar-leads')}
                  >
                    <Search className="h-4 w-4" />
                    Coletar leads
                  </Button>
                </CardContent>
              </Card>
              {/* HIBERNANDO: upload de planilha desativado temporariamente — reativar quando necessário */}
              {false && (
                <FileUpload
                  onFileLoaded={handleFileLoaded}
                  disabled={isRunning || savingContactsToProfile}
                  savingToProfile={savingContactsToProfile}
                />
              )}
              <MessageConfig mensagemBase={mensagemBase} onMensagemChange={setMensagemBase} disabled={isRunning} />
            </div>

            {/* Coluna 3: Painel de Controle */}
            <div className="min-w-0">
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Painel de Controle</CardTitle>
                    <CardDescription>
                      {!dispatchInstanceName
                        ? 'Conecte um WhatsApp no card "Conector WhatsApp" na configuração acima.'
                        : !mensagemBase.trim()
                          ? 'Escreva uma mensagem base no card "Configuração da Mensagem" na configuração acima.'
                          : contacts.length === 0
                            ? 'Adicione contatos via Coletar leads antes de disparar.'
                            : (
                              <span>
                                {dispatchInstanceName}{' '}
                                &mdash;{' '}
                                <span className={cn(
                                  'font-medium',
                                  filteredPendingCount === 0 ? 'text-destructive' : 'text-foreground'
                                )}>
                                  {filteredPendingCount} contato{filteredPendingCount !== 1 ? 's' : ''}
                                </span>
                                {' '}serão disparados
                                {dispatchFilter !== 'todos' && (
                                  <span className="text-muted-foreground">
                                    {' '}(filtro: {dispatchFilter === 'primeiro' ? 'Primeiro contato' : 'Já enviou'})
                                  </span>
                                )}
                                {dispatchSegmento !== '_todos' && (
                                  <span className="text-muted-foreground"> · {dispatchSegmento}</span>
                                )}
                              </span>
                            )}
                    </CardDescription>
                  </div>

                  {/* Checklist visual: WhatsApp | IA | Contatos | Mensagem */}
                  {!isRunning && (
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-2">
                      <span className={cn('flex items-center gap-1', dispatchInstanceName && 'text-success')}>
                        {dispatchInstanceName ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        WhatsApp
                      </span>
                      <span className={cn('flex items-center gap-1', llmConfig?.apiKey?.trim() && 'text-success')}>
                        {llmConfig?.apiKey?.trim() ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        IA
                      </span>
                      <span className={cn('flex items-center gap-1', contacts.length > 0 && 'text-success')}>
                        {contacts.length > 0 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        Contatos
                      </span>
                      <span className={cn('flex items-center gap-1', !!mensagemBase.trim() && 'text-success')}>
                        {mensagemBase.trim() ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        Mensagem
                      </span>
                    </div>
                  )}
                  
                  {isRunning ? (
                      <Button variant="destructive" size="lg" onClick={stopDispatcher} className="gap-2">
                        <Square className="h-4 w-4" />
                        PARAR DISPAROS
                      </Button>
                    ) : (() => {
                      const canStart = contacts.length > 0 && mensagemBase.trim() && dispatchInstanceName;
                      const missing: string[] = [];
                      if (!dispatchInstanceName) missing.push('Conecte um WhatsApp');
                      if (!mensagemBase.trim()) missing.push('Escreva uma mensagem base');
                      if (contacts.length === 0) missing.push('Adicione contatos via Coletar leads');
                      const btn = (
                        <Button
                          size="lg"
                          onClick={runDispatcher}
                          disabled={!canStart}
                          className="gap-2 gradient-primary shadow-glow hover:shadow-lg transition-all"
                        >
                          <Play className="h-4 w-4" />
                          INICIAR DISPAROS
                        </Button>
                      );
                      return canStart ? btn : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-block">{btn}</span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[260px]">
                            <p className="font-medium mb-1">Para habilitar o botão:</p>
                            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                              {missing.map((m) => (
                                <li key={m}>{m}</li>
                              ))}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })()}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Intervalo entre disparos (editável) */}
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-muted-foreground">Intervalo entre disparos:</span>
                  <label className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">mín</span>
                    <input
                      type="number"
                      min={DISPATCH_DELAY_MIN_LIMIT}
                      max={DISPATCH_DELAY_MAX_LIMIT}
                      value={delayMin}
                      onChange={(e) => {
                        const v = Math.min(DISPATCH_DELAY_MAX_LIMIT, Math.max(DISPATCH_DELAY_MIN_LIMIT, Number(e.target.value) || DISPATCH_DELAY_MIN_LIMIT));
                        setDelayMin(v);
                        localStorage.setItem('disparador_delay_min', String(v));
                        if (delayMax < v) {
                          setDelayMax(v);
                          localStorage.setItem('disparador_delay_max', String(v));
                        }
                      }}
                      disabled={isRunning}
                      className="w-14 rounded border bg-background px-2 py-1 text-center"
                    />
                    <span className="text-muted-foreground">s</span>
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">máx</span>
                    <input
                      type="number"
                      min={DISPATCH_DELAY_MIN_LIMIT}
                      max={DISPATCH_DELAY_MAX_LIMIT}
                      value={delayMax}
                      onChange={(e) => {
                        const v = Math.min(DISPATCH_DELAY_MAX_LIMIT, Math.max(DISPATCH_DELAY_MIN_LIMIT, Number(e.target.value) || DISPATCH_DELAY_MIN_LIMIT));
                        setDelayMax(v);
                        localStorage.setItem('disparador_delay_max', String(v));
                        if (delayMin > v) {
                          setDelayMin(v);
                          localStorage.setItem('disparador_delay_min', String(v));
                        }
                      }}
                      disabled={isRunning}
                      className="w-14 rounded border bg-background px-2 py-1 text-center"
                    />
                    <span className="text-muted-foreground">s</span>
                  </label>
                  <span className="text-muted-foreground text-xs">(entre {DISPATCH_DELAY_MIN_LIMIT} e {DISPATCH_DELAY_MAX_LIMIT}s)</span>
                </div>

                {/* Progresso de geração de IA (Fase 1) */}
                {isGenerating && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Gerando mensagens com IA...
                      </span>
                      <span className="font-medium">{generateProgress}/{generateTotal}</span>
                    </div>
                    <Progress
                      value={generateTotal > 0 ? (generateProgress / generateTotal) * 100 : 0}
                      className="h-2"
                    />
                  </div>
                )}

                {/* Progresso do disparo no backend (Fase 2) */}
                {!isGenerating && activeSession?.status === 'running' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Disparando no servidor...
                      </span>
                      <span className="font-medium">{activeSession.sent}/{activeSession.total}</span>
                    </div>
                    <Progress
                      value={activeSession.total > 0 ? (activeSession.sent / activeSession.total) * 100 : 0}
                      className="h-2"
                    />
                    <p className="text-xs text-muted-foreground">
                      Pode fechar o site — o processo continua no servidor.
                    </p>
                  </div>
                )}

                {/* Progresso local (legado — exibido se não houver sessão ativa) */}
                {!isGenerating && activeSession?.status !== 'running' && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Progresso</span>
                      <span className="font-medium">{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                )}

                {/* Countdown Timer */}
                {countdown > 0 && <CountdownTimer seconds={countdown} maxSeconds={maxCountdown} />}
              </CardContent>
            </Card>
            </div>
          </div>
        </section>

        {/* Seção 2: Lista de contatos — abaixo da configuração */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">Lista de contatos</h2>
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Contatos na lista de disparo</CardTitle>
                  <CardDescription>
                    {contacts.length > 0
                      ? `${contacts.length} contatos carregados.`
                      : 'Use Coletar leads para adicionar contatos à lista de disparo.'}
                    {excludedIds.size > 0 && (
                      <span className="ml-2 text-muted-foreground/70">
                        ({excludedIds.size} oculto{excludedIds.size !== 1 ? 's' : ''} desta lista)
                      </span>
                    )}
                  </CardDescription>
                </div>
                {excludedIds.size > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRestoreAll}
                    disabled={isRunning}
                    className="shrink-0 gap-2 text-muted-foreground hover:text-foreground"
                    title={`Restaurar ${excludedIds.size} contato(s) oculto(s) na lista`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restaurar lista completa
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ContactsTable
                contacts={contacts}
                onRetry={handleRetry}
                onRetryAll={handleRetryAll}
                onRemove={handleRemove}
                onRemoveSelected={handleRemoveSelected}
                isRunning={isRunning}
                currentIndex={currentIndex}
                filter={dispatchFilter}
                onFilterChange={setDispatchFilter}
                segmentoFilter={dispatchSegmento}
                onSegmentoFilterChange={setDispatchSegmento}
              />
            </CardContent>
          </Card>
        </section>
      </main>

      <LLMConfigDialog open={llmConfigOpen} onOpenChange={setLLMConfigOpen} />
    </div>;
}