import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Square, Users, CheckCircle2, XCircle, LogOut, History, KeyRound, ListOrdered, Search } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { generateAIMessage, sendToWebhook, getRandomDelay, sleep, DISPATCH_DELAY_MIN_LIMIT, DISPATCH_DELAY_MAX_LIMIT } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useDispatchHistory } from '@/hooks/useDispatchHistory';
import { useContacts } from '@/hooks/useContacts';
import { useLLMConfig } from '@/hooks/useLLMConfig';
import { useWhatsAppInstances } from '@/hooks/useWhatsAppInstances';

export function Dashboard() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [mensagemBase, setMensagemBase] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [savingContactsToProfile, setSavingContactsToProfile] = useState(false);
  const [llmConfigOpen, setLLMConfigOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [countdown, setCountdown] = useState(0);
  const [maxCountdown, setMaxCountdown] = useState(0);
  const [delayMin, setDelayMin] = useState(() => {
    const v = Number(localStorage.getItem('disparador_delay_min'));
    return Number.isFinite(v) && v >= DISPATCH_DELAY_MIN_LIMIT && v <= DISPATCH_DELAY_MAX_LIMIT ? v : DISPATCH_DELAY_MIN_LIMIT;
  });
  const [delayMax, setDelayMax] = useState(() => {
    const v = Number(localStorage.getItem('disparador_delay_max'));
    return Number.isFinite(v) && v >= DISPATCH_DELAY_MIN_LIMIT && v <= DISPATCH_DELAY_MAX_LIMIT ? v : 25;
  });
  const abortRef = useRef(false);
  const {
    toast
  } = useToast();
  const {
    user,
    signOut
  } = useAuth();
  const {
    history,
    loading: historyLoading,
    saveDispatch,
    refreshHistory
  } = useDispatchHistory();
  const {
    contacts: savedContacts,
    loading: contactsLoading,
    saveContactsFromFile,
    updateContactMessage,
    deleteContact,
    refreshContacts,
    totalContacts,
  } = useContacts();
  const { config: llmConfig } = useLLMConfig();
  const { instances: whatsappInstances } = useWhatsAppInstances();
  const navigate = useNavigate();

  /** Instância WhatsApp conectada usada no disparo (primeira com status 'open'). */
  const dispatchInstanceName = whatsappInstances.find((i) => i.status === 'open')?.instance_name;
  const totalEnviados = contacts.filter(c => c.status === 'sucesso').length;
  const totalErros = contacts.filter(c => c.status === 'erro').length;
  const progress = contacts.length > 0 ? (totalEnviados + totalErros) / contacts.length * 100 : 0;

  // Ao carregar: se a lista de disparo estiver vazia, preenche com os contatos salvos no perfil
  useEffect(() => {
    if (contactsLoading || contacts.length > 0) return;
    if (savedContacts.length > 0) {
      const asContactRows: ContactRow[] = savedContacts.map((c) => ({
        id: c.id,
        empresa: c.empresa,
        telefone: c.telefone,
        telefoneFormatado: c.telefone,
        mensagemIA: c.ultima_mensagem ?? '',
        status: 'pendente' as const,
        jaEnviou: !!c.ultima_mensagem_data,
      }));
      setContacts(asContactRows);
    }
  }, [contactsLoading, savedContacts, contacts.length]);

  // Handle page unload warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRunning) {
        e.preventDefault();
        e.returnValue = 'Os disparos estão em andamento. Tem certeza que deseja sair?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isRunning]);
  const updateContact = useCallback((id: string, updates: Partial<ContactRow>) => {
    setContacts(prev => prev.map(c => c.id === id ? {
      ...c,
      ...updates
    } : c));
  }, []);
  const processContact = async (contact: ContactRow): Promise<boolean> => {
    if (abortRef.current) {
      // Salva registro de cancelamento se o processo foi abortado
      try {
        await saveDispatch({
          empresa: contact.empresa,
          telefone: contact.telefoneFormatado,
          mensagem_base: mensagemBase,
          mensagem_ia: null,
          status: 'cancelled',
          error_message: 'Processo cancelado pelo usuário'
        });
      } catch (error) {
        console.error(`Erro ao salvar histórico de cancelamento para ${contact.empresa}:`, error);
      }
      return false;
    }

    let mensagemIA = mensagemBase;
    let errorMessage = '';

    // Step 1: Generate AI message
    updateContact(contact.id, {
      status: 'gerando-ia'
    });
    
    try {
      const aiResult = await generateAIMessage(contact.empresa, mensagemBase, llmConfig ?? null);
      mensagemIA = aiResult.message;
      
      if (!aiResult.success && aiResult.error) {
        errorMessage = `IA: ${aiResult.error}`;
        console.warn(`Erro ao gerar mensagem IA para ${contact.empresa}:`, aiResult.error);
        // Continua com a mensagem original mesmo se a IA falhar
      }
      
      updateContact(contact.id, {
        mensagemIA
      });
    } catch (error) {
      console.error(`Erro inesperado ao gerar mensagem IA para ${contact.empresa}:`, error);
      errorMessage = 'Erro inesperado ao gerar mensagem';
    }
    
    if (abortRef.current) {
      // Salva registro de cancelamento após gerar IA
      try {
        await saveDispatch({
          empresa: contact.empresa,
          telefone: contact.telefoneFormatado,
          mensagem_base: mensagemBase,
          mensagem_ia: mensagemIA,
          status: 'cancelled',
          error_message: 'Processo cancelado pelo usuário após gerar mensagem IA'
        });
      } catch (error) {
        console.error(`Erro ao salvar histórico de cancelamento para ${contact.empresa}:`, error);
      }
      return false;
    }

    // Step 2: Send to webhook (sempre exige instância do usuário)
    if (!dispatchInstanceName) {
      updateContact(contact.id, { status: 'erro', erro: 'Nenhum WhatsApp conectado. Conecte no Conector WhatsApp.' });
      return false;
    }
    updateContact(contact.id, {
      status: 'enviando'
    });
    
    try {
      const webhookResult = await sendToWebhook(contact.empresa, contact.telefoneFormatado, mensagemIA, dispatchInstanceName);
      
      if (webhookResult.success) {
        updateContact(contact.id, {
          status: 'sucesso'
        });

        // Save to history - sempre salva disparos bem-sucedidos
        try {
          await saveDispatch({
            empresa: contact.empresa,
            telefone: contact.telefoneFormatado,
            mensagem_base: mensagemBase,
            mensagem_ia: mensagemIA,
            status: 'success'
          });
        } catch (error) {
          console.error(`Erro ao salvar histórico para ${contact.empresa}:`, error);
          // Não falha o processo se não conseguir salvar o histórico, mas loga o erro
        }

        // Update contact's last message
        try {
          await updateContactMessage(contact.telefoneFormatado, mensagemIA);
        } catch (error) {
          console.error(`Erro ao atualizar contato ${contact.empresa}:`, error);
          // Não falha o processo se não conseguir atualizar o contato
        }

        return true;
      } else {
        const finalErrorMessage = webhookResult.error || 'Falha ao enviar';
        updateContact(contact.id, {
          status: 'erro',
          erro: finalErrorMessage
        });

        // Save error to history - sempre salva disparos com erro
        try {
          await saveDispatch({
            empresa: contact.empresa,
            telefone: contact.telefoneFormatado,
            mensagem_base: mensagemBase,
            mensagem_ia: mensagemIA,
            status: 'error',
            error_message: finalErrorMessage
          });
        } catch (error) {
          console.error(`Erro ao salvar histórico de erro para ${contact.empresa}:`, error);
        }
        
        return false;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro inesperado ao enviar';
      console.error(`Erro inesperado ao enviar para ${contact.empresa}:`, error);
      
      updateContact(contact.id, {
        status: 'erro',
        erro: errorMsg
      });

      // Save error to history - sempre salva erros inesperados
      try {
        await saveDispatch({
          empresa: contact.empresa,
          telefone: contact.telefoneFormatado,
          mensagem_base: mensagemBase,
          mensagem_ia: mensagemIA,
          status: 'error',
          error_message: errorMsg
        });
      } catch (saveError) {
        console.error(`Erro ao salvar histórico de erro para ${contact.empresa}:`, saveError);
      }
      
      return false;
    }
  };
  const runDispatcher = async () => {
    if (!dispatchInstanceName) {
      toast({
        title: "Conecte um WhatsApp",
        description: "Cada usuário precisa ter seu próprio WhatsApp conectado. Use o Conector WhatsApp ao lado para conectar e tente novamente.",
        variant: "destructive"
      });
      return;
    }
    if (!mensagemBase.trim()) {
      toast({
        title: "Mensagem obrigatória",
        description: "Digite uma mensagem base antes de iniciar.",
        variant: "destructive"
      });
      return;
    }
    const pendingContacts = contacts.filter(c => c.status === 'pendente' || c.status === 'erro');
    if (pendingContacts.length === 0) {
      toast({
        title: "Nenhum contato pendente",
        description: "Todos os contatos já foram processados."
      });
      return;
    }
    setIsRunning(true);
    abortRef.current = false;
    toast({
      title: "Disparos iniciados",
      description: `Processando ${pendingContacts.length} contatos...`
    });
    let successCount = 0;
    let errorCount = 0;
    for (let i = 0; i < contacts.length; i++) {
      if (abortRef.current) break;
      const contact = contacts[i];
      if (contact.status !== 'pendente' && contact.status !== 'erro') continue;
      setCurrentIndex(i);
      const success = await processContact(contact);
      if (abortRef.current) break;
      if (success) {
        successCount += 1;
      } else {
        errorCount += 1;
      }

      // Intervalo aleatório (editável pelo usuário, min 2s / max 40s) entre cada disparo bem-sucedido
      if (success && i < contacts.length - 1) {
        const delay = getRandomDelay(delayMin, delayMax);
        setMaxCountdown(delay);
        setCountdown(delay);
        for (let s = delay; s > 0; s--) {
          if (abortRef.current) break;
          setCountdown(s);
          await sleep(1);
        }
        setCountdown(0);
      }
    }
    setIsRunning(false);
    setCurrentIndex(-1);
    setCountdown(0);
    if (!abortRef.current) {
      toast({
        title: "Disparos concluídos!",
        description: `${successCount} enviados com sucesso, ${errorCount} erros.`
      });
    }
  };
  const stopDispatcher = () => {
    abortRef.current = true;
    toast({
      title: "Disparos pausados",
      description: "O processo será interrompido após a ação atual."
    });
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
                      {dispatchInstanceName && contacts.length > 0 && mensagemBase.trim()
                        ? `Disparando pelo seu WhatsApp: ${dispatchInstanceName}`
                        : !dispatchInstanceName
                          ? 'Conecte um WhatsApp no card "Conector WhatsApp" na configuração acima.'
                          : !mensagemBase.trim()
                            ? 'Escreva uma mensagem base no card "Configuração da Mensagem" na configuração acima.'
                            : contacts.length === 0
                              ? 'Adicione contatos via Coletar leads antes de disparar.'
                              : `Disparando pelo seu WhatsApp: ${dispatchInstanceName}`}
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

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progresso</span>
                    <span className="font-medium">{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>

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
              <CardTitle className="text-lg">Contatos na lista de disparo</CardTitle>
              <CardDescription>
                {contacts.length > 0
                  ? `${contacts.length} contatos carregados.`
                  : 'Use Coletar leads para adicionar contatos à lista de disparo.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ContactsTable contacts={contacts} onRetry={handleRetry} onRetryAll={handleRetryAll} onRemove={handleRemove} isRunning={isRunning} currentIndex={currentIndex} />
            </CardContent>
          </Card>
        </section>
      </main>

      <LLMConfigDialog open={llmConfigOpen} onOpenChange={setLLMConfigOpen} />
    </div>;
}