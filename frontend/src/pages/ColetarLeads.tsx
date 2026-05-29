import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Search, RefreshCw, Building2,
  Phone, Mail, MapPin, Zap, Database, ChevronLeft, ChevronRight,
  SendHorizontal, ChevronsUpDown, Check, ListChecks, KeyRound, Plus, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { CNAES, CNAE_CATEGORIES, ESTADOS } from '@/data/cnaes';
import { useAuth } from '@/hooks/useAuth';
import { useContacts } from '@/hooks/useContacts';
import { apiClient } from '@/lib/apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Lead {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  data_abertura: string | null;
  porte: string | null;
  cnae_principal_codigo: number;
  cnae_principal_texto: string;
  telefone: string | null;
  telefone_secundario: string | null;
  email: string | null;
  cidade: string | null;
  estado: string | null;
  simples_nacional: boolean;
  mei: boolean;
  created_at: string;
  status_lead: string | null;
}

// Lead simplificado retornado pelo endpoint de seleção em lote
interface SelectLead {
  id: string;
  empresa: string;
  telefone: string;
}

interface CreditInfo {
  id: string;
  index: number;
  label: string;
  credits: number;
  key_hint: string;
  source: 'env' | 'db';
  can_delete: boolean;
}

interface Stats {
  pool_total: string;
  adicionados_hoje: string;
  estados: string;
  segmentos: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatCnpj(cnpj: string) {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatPhone(p: string | null) {
  if (!p) return null;
  const d = p.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ColetarLeads() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { saveContactsFromFile } = useContacts();

  // Filters
  const [selectedCnae, setSelectedCnae] = useState<string>('');
  const [selectedEstado, setSelectedEstado] = useState<string>('');
  const [cnaePopoverOpen, setCnaePopoverOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [limite, setLimite] = useState(20);

  // Data
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  /**
   * Seleção multi-página: Map<id, {empresa, telefone}>
   * Guarda os dados de cada lead selecionado mesmo quando muda de página.
   */
  const [selectedMap, setSelectedMap] = useState<Map<string, { empresa: string; telefone: string }>>(new Map());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [addingToDispatch, setAddingToDispatch] = useState(false);

  // Credits
  const [credits, setCredits] = useState<CreditInfo[]>([]);
  const [totalCredits, setTotalCredits] = useState<number | null>(null);

  // Chave preferida (null = auto)
  const [preferredKeyId, setPreferredKeyId] = useState<string | null>(null);

  // Dialog gerenciar chaves
  const [keysDialogOpen, setKeysDialogOpen] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState<Stats | null>(null);

  // Fetch state
  const [isFetching, setIsFetching] = useState(false);
  const [fetchLog, setFetchLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  // Loading
  const [loadingLeads, setLoadingLeads] = useState(false);

  // ─── Load on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    loadStats();
    loadCredits();
  }, []);

  useEffect(() => {
    loadLeads();
  }, [page, selectedCnae, selectedEstado, searchText, user?.id]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [fetchLog]);

  // ─── API calls ──────────────────────────────────────────────────────────
  async function loadStats() {
    try {
      const r = await apiClient.get('/api/leads/stats');
      const data = await r.json();
      setStats(data);
    } catch { /* silent */ }
  }

  async function loadCredits() {
    try {
      const r = await apiClient.get('/api/leads/credits');
      const data = await r.json();
      setCredits(data.keys ?? []);
      setTotalCredits(data.total ?? 0);
    } catch { /* silent */ }
  }

  async function loadLeads() {
    setLoadingLeads(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (selectedCnae) params.set('cnae', selectedCnae);
      if (selectedEstado) params.set('estado', selectedEstado);
      if (searchText.trim()) params.set('search', searchText.trim());
      // user_id para filtrar leads com erro no backend
      if (user?.id) params.set('user_id', user.id);

      const r = await apiClient.get(`/api/leads/pool?${params}`);
      const data = await r.json();
      setLeads(data.leads ?? []);
      setTotal(data.total ?? 0);
    } catch {
      toast({ title: 'Erro ao carregar leads', variant: 'destructive' });
    } finally {
      setLoadingLeads(false);
    }
  }

  // ─── Selection helpers ──────────────────────────────────────────────────

  function toggleSelect(lead: Lead) {
    if (!lead.telefone) return;
    setSelectedMap(prev => {
      const next = new Map(prev);
      if (next.has(lead.id)) {
        next.delete(lead.id);
      } else {
        next.set(lead.id, {
          empresa: lead.nome_fantasia || lead.razao_social,
          telefone: lead.telefone!.replace(/\D/g, ''),
        });
      }
      return next;
    });
  }

  function toggleSelectPage() {
    const pageLeadsWithPhone = leads.filter(l => l.telefone);
    const allPageSelected = pageLeadsWithPhone.every(l => selectedMap.has(l.id));

    setSelectedMap(prev => {
      const next = new Map(prev);
      if (allPageSelected) {
        pageLeadsWithPhone.forEach(l => next.delete(l.id));
      } else {
        pageLeadsWithPhone.forEach(l => next.set(l.id, {
          empresa: l.nome_fantasia || l.razao_social,
          telefone: l.telefone!.replace(/\D/g, ''),
        }));
      }
      return next;
    });
  }

  /**
   * Busca N leads do backend (com filtros ativos) e adiciona à seleção.
   * Usado pelos botões "Selecionar 50 / 100 / 200 / Todos".
   */
  async function handleBulkSelect(n: number) {
    setBulkLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(n) });
      if (selectedCnae) params.set('cnae', selectedCnae);
      if (selectedEstado) params.set('estado', selectedEstado);
      if (searchText.trim()) params.set('search', searchText.trim());
      if (user?.id) params.set('user_id', user.id);

      const r = await apiClient.get(`/api/leads/pool/select?${params}`);
      const data = await r.json();
      const fetched: SelectLead[] = data.leads ?? [];

      if (fetched.length === 0) {
        toast({ title: 'Nenhum lead disponível com os filtros atuais', variant: 'destructive' });
        return;
      }

      setSelectedMap(prev => {
        const next = new Map(prev);
        fetched.forEach(l => next.set(l.id, {
          empresa: l.empresa,
          telefone: l.telefone.replace(/\D/g, ''),
        }));
        return next;
      });

      toast({ title: `${fetched.length} lead${fetched.length !== 1 ? 's' : ''} adicionado${fetched.length !== 1 ? 's' : ''} à seleção` });
    } catch {
      toast({ title: 'Erro ao buscar leads para seleção', variant: 'destructive' });
    } finally {
      setBulkLoading(false);
    }
  }

  function clearSelection() {
    setSelectedMap(new Map());
  }

  // ─── Adicionar leads ao disparo (Supabase contacts) ─────────────────────
  async function handleAddToDispatch() {
    if (selectedMap.size === 0) return;
    setAddingToDispatch(true);
    try {
      // Deduplica por telefone antes de salvar
      const seen = new Set<string>();
      const toAdd: { empresa: string; telefone: string }[] = [];
      selectedMap.forEach(({ empresa, telefone }) => {
        const tel = telefone.replace(/\D/g, '');
        if (tel && !seen.has(tel)) {
          seen.add(tel);
          toAdd.push({ empresa, telefone: tel });
        }
      });

      if (toAdd.length === 0) {
        toast({ title: 'Nenhum lead selecionado possui telefone', variant: 'destructive' });
        return;
      }

      await saveContactsFromFile(toAdd);
      toast({ title: `${toAdd.length} empresa${toAdd.length !== 1 ? 's' : ''} adicionada${toAdd.length !== 1 ? 's' : ''} ao disparo!` });
      clearSelection();
    } catch (e: any) {
      toast({ title: 'Erro ao adicionar ao disparo', description: e.message, variant: 'destructive' });
    } finally {
      setAddingToDispatch(false);
    }
  }

  // ─── Gerenciar chaves CNPJA ─────────────────────────────────────────────
  async function handleAddKey() {
    if (!newKeyValue.trim()) {
      toast({ title: 'Cole a chave CNPJA antes de salvar', variant: 'destructive' });
      return;
    }
    setSavingKey(true);
    try {
      const r = await apiClient.post('/api/leads/keys', {
        key_value: newKeyValue.trim(),
        label: newKeyLabel.trim(),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: data.error ?? 'Erro ao salvar chave', variant: 'destructive' });
        return;
      }
      toast({ title: 'Chave adicionada!', description: `${data.credits} crédito${data.credits !== 1 ? 's' : ''} disponíveis.` });
      setNewKeyValue('');
      setNewKeyLabel('');
      await loadCredits();
    } catch {
      toast({ title: 'Erro ao adicionar chave', variant: 'destructive' });
    } finally {
      setSavingKey(false);
    }
  }

  async function handleDeleteKey(id: string) {
    setDeletingKeyId(id);
    try {
      const r = await apiClient.delete(`/api/leads/keys/${id}`);
      if (!r.ok) {
        const data = await r.json();
        toast({ title: data.error ?? 'Erro ao remover chave', variant: 'destructive' });
        return;
      }
      toast({ title: 'Chave removida.' });
      // Se a chave removida era a preferida, volta para auto
      if (preferredKeyId === id) setPreferredKeyId(null);
      await loadCredits();
    } catch {
      toast({ title: 'Erro ao remover chave', variant: 'destructive' });
    } finally {
      setDeletingKeyId(null);
    }
  }

  // ─── Trigger CNPJA fetch (SSE) ──────────────────────────────────────────
  async function handleFetch() {
    if (!selectedCnae || !selectedEstado) {
      toast({ title: 'Selecione segmento e estado antes de buscar', variant: 'destructive' });
      return;
    }

    if (totalCredits === 0) {
      toast({ title: 'Sem créditos disponíveis nas chaves CNPJA', variant: 'destructive' });
      return;
    }

    setIsFetching(true);
    setFetchLog(['Iniciando busca...']);

    const body: Record<string, unknown> = { estado: selectedEstado, cnae: selectedCnae, limite };
    if (preferredKeyId) body.preferredKeyId = preferredKeyId;

    const resp = await apiClient.stream('/api/leads/fetch', body);

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        try {
          const event = JSON.parse(line.slice(6));

          if (event.type === 'start')        setFetchLog(l => [...l, event.message]);
          if (event.type === 'key')          setFetchLog(l => [...l, `🔑 ${event.message}`]);
          if (event.type === 'progress')     setFetchLog(l => [...l, `✅ ${event.saved}/${event.total} — ${event.nome}`]);
          if (event.type === 'key_exhausted') setFetchLog(l => [...l, `⚠️ ${event.message}`]);
          if (event.type === 'error')        setFetchLog(l => [...l, `❌ ${event.message}`]);

          if (event.type === 'done') {
            setFetchLog(l => [...l, `\n✅ Concluído: ${event.saved} novas empresas | ${event.skipped} ignoradas`]);
            setFetchLog(l => [...l, `💳 Créditos restantes: ${event.totalCredits}`]);
            setCredits(event.credits ?? []);
            setTotalCredits(event.totalCredits ?? 0);
            setIsFetching(false);
            loadLeads();
            loadStats();
          }
        } catch { /* parse error, skip */ }
      }
    }
  }

  // ─── Copy phone to clipboard ────────────────────────────────────────────
  function copyPhone(phone: string | null) {
    if (!phone) return;
    navigator.clipboard.writeText(phone.replace(/\D/g, ''));
    toast({ title: 'Número copiado!' });
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pageLeadsWithPhone = leads.filter(l => l.telefone);
  const allPageSelected = pageLeadsWithPhone.length > 0 && pageLeadsWithPhone.every(l => selectedMap.has(l.id));
  const somePageSelected = pageLeadsWithPhone.some(l => selectedMap.has(l.id));

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Coletar Leads</h1>
          <p className="text-muted-foreground text-sm">Busque empresas por segmento e região via CNPJA</p>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{parseInt(stats.pool_total).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Empresas no banco</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-green-500">{stats.adicionados_hoje}</p>
              <p className="text-xs text-muted-foreground">Adicionadas hoje</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{stats.estados}</p>
              <p className="text-xs text-muted-foreground">Estados cobertos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{totalCredits ?? '...'}</p>
              <p className="text-xs text-muted-foreground">Créditos CNPJA</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Fetch controls */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-500" />
            Buscar novas empresas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            {/* Segmento — combobox com busca */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">Segmento</label>
              <Popover open={cnaePopoverOpen} onOpenChange={setCnaePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={cnaePopoverOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {selectedCnae
                        ? CNAES.find(c => String(c.id) === selectedCnae)?.label ?? 'Segmento...'
                        : 'Selecione o segmento...'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[340px] p-0" align="start">
                  <Command filter={(value, search) =>
                    value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                  }>
                    <CommandInput placeholder="Buscar segmento..." />
                    <CommandList className="max-h-72">
                      <CommandEmpty>Nenhum segmento encontrado.</CommandEmpty>
                      {CNAE_CATEGORIES.map(cat => (
                        <CommandGroup key={cat} heading={cat}>
                          {CNAES.filter(c => c.category === cat).map(c => (
                            <CommandItem
                              key={c.id}
                              value={`${c.label} ${c.id}`}
                              onSelect={() => {
                                setSelectedCnae(String(c.id));
                                setCnaePopoverOpen(false);
                              }}
                            >
                              <Check className={cn('mr-2 h-4 w-4', selectedCnae === String(c.id) ? 'opacity-100' : 'opacity-0')} />
                              {c.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Estado */}
            <div className="w-32">
              <label className="text-xs text-muted-foreground mb-1 block">Estado</label>
              <Select value={selectedEstado} onValueChange={setSelectedEstado}>
                <SelectTrigger>
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS.map(uf => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Limite */}
            <div className="w-32">
              <label className="text-xs text-muted-foreground mb-1 block">Quantidade</label>
              <Select value={String(limite)} onValueChange={v => setLimite(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map(n => (
                    <SelectItem key={n} value={String(n)}>{n} empresas</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Chave preferida */}
            <div className="w-52">
              <label className="text-xs text-muted-foreground mb-1 block">Chave CNPJA</label>
              <Select
                value={preferredKeyId ?? 'auto'}
                onValueChange={v => setPreferredKeyId(v === 'auto' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (primeira com créditos)</SelectItem>
                  {credits.map(c => (
                    <SelectItem key={c.id} value={c.id} disabled={c.credits === 0}>
                      {c.label} — {c.credits} crédito{c.credits !== 1 ? 's' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={handleFetch} disabled={isFetching} className="gap-2">
                {isFetching
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Buscando...</>
                  : <><Search className="h-4 w-4" /> Buscar empresas</>
                }
              </Button>
              <Button
                variant="outline"
                size="icon"
                title="Gerenciar chaves CNPJA"
                onClick={() => setKeysDialogOpen(true)}
              >
                <KeyRound className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Créditos por chave */}
          {credits.length > 0 && (
            <div className="flex gap-2 flex-wrap items-center">
              {credits.map(c => (
                <Badge key={c.id} variant={c.credits > 0 ? 'secondary' : 'destructive'} className="text-xs">
                  {c.label}: {c.credits} crédito{c.credits !== 1 ? 's' : ''}
                </Badge>
              ))}
              <Button variant="ghost" size="sm" className="h-5 text-xs" onClick={loadCredits}>
                <RefreshCw className="h-3 w-3 mr-1" /> atualizar
              </Button>
            </div>
          )}

          {/* Log de progresso */}
          {fetchLog.length > 0 && (
            <div
              ref={logRef}
              className="bg-muted rounded-md p-3 text-xs font-mono max-h-32 overflow-y-auto space-y-0.5"
            >
              {fetchLog.map((line, i) => (
                <div key={i} className="text-muted-foreground">{line}</div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4" />
                Pool de leads
                {total > 0 && <Badge variant="secondary">{total.toLocaleString()} empresas</Badge>}
              </CardTitle>

              {/* Botão de seleção em lote */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-7"
                    disabled={bulkLoading || loadingLeads}
                  >
                    {bulkLoading
                      ? <RefreshCw className="h-3 w-3 animate-spin" />
                      : <ListChecks className="h-3 w-3" />
                    }
                    Selecionar
                    {selectedMap.size > 0 && (
                      <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                        {selectedMap.size}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Selecionar leads com telefone
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleBulkSelect(50)}>
                    Selecionar 50
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkSelect(100)}>
                    Selecionar 100
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkSelect(200)}>
                    Selecionar 200
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkSelect(500)}>
                    Selecionar todos (até 500)
                  </DropdownMenuItem>
                  {selectedMap.size > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={clearSelection}
                        className="text-muted-foreground"
                      >
                        Limpar seleção ({selectedMap.size})
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Botão de disparar selecionados */}
              {selectedMap.size > 0 && (
                <Button
                  size="sm"
                  onClick={handleAddToDispatch}
                  disabled={addingToDispatch}
                  className="gap-1.5 h-7"
                >
                  {addingToDispatch
                    ? <RefreshCw className="h-3 w-3 animate-spin" />
                    : <SendHorizontal className="h-3 w-3" />
                  }
                  Disparar {selectedMap.size} selecionado{selectedMap.size !== 1 ? 's' : ''}
                </Button>
              )}
            </div>

            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
              <Input
                placeholder="Buscar empresa, CNPJ..."
                className="w-52 h-8 text-sm"
                value={searchText}
                onChange={e => { setSearchText(e.target.value); setPage(0); }}
              />
              <Select value={selectedEstado || 'all'} onValueChange={v => { setSelectedEstado(v === 'all' ? '' : v); setPage(0); }}>
                <SelectTrigger className="w-24 h-8 text-sm">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {ESTADOS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={selectedCnae || 'all'} onValueChange={v => { setSelectedCnae(v === 'all' ? '' : v); setPage(0); }}>
                <SelectTrigger className="w-44 h-8 text-sm">
                  <SelectValue placeholder="Segmento" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">Todos segmentos</SelectItem>
                  {CNAE_CATEGORIES.map(cat => (
                    <SelectGroup key={cat}>
                      <SelectLabel>{cat}</SelectLabel>
                      {CNAES.filter(c => c.category === cat).map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loadingLeads ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Building2 className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Nenhuma empresa encontrada.</p>
              <p className="text-xs mt-1">Use o painel acima para buscar empresas via CNPJA.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-2 w-8">
                      <Checkbox
                        checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                        onCheckedChange={toggleSelectPage}
                      />
                    </th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Empresa</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Segmento</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Localização</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Contato</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Idade</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, idx) => (
                    <tr
                      key={lead.id}
                      className={`border-b hover:bg-muted/20 transition-colors cursor-pointer ${selectedMap.has(lead.id) ? 'bg-primary/5' : idx % 2 === 0 ? '' : 'bg-muted/5'}`}
                      onClick={() => toggleSelect(lead)}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedMap.has(lead.id)}
                          disabled={!lead.telefone}
                          onCheckedChange={() => toggleSelect(lead)}
                        />
                      </td>
                      {/* Empresa */}
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="font-medium truncate" title={lead.razao_social}>
                          {lead.nome_fantasia || lead.razao_social}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatCnpj(lead.cnpj)}</p>
                        {lead.porte && (
                          <Badge variant="outline" className="text-xs mt-1 h-4">{lead.porte}</Badge>
                        )}
                      </td>

                      {/* Segmento */}
                      <td className="px-4 py-3 max-w-[180px]">
                        <p className="text-xs text-muted-foreground truncate" title={lead.cnae_principal_texto}>
                          {lead.cnae_principal_texto || '—'}
                        </p>
                        <p className="text-xs text-muted-foreground/60">CNAE {lead.cnae_principal_codigo}</p>
                        {lead.mei && <Badge variant="secondary" className="text-xs mt-1 h-4">MEI</Badge>}
                        {lead.simples_nacional && !lead.mei && <Badge variant="secondary" className="text-xs mt-1 h-4">Simples</Badge>}
                      </td>

                      {/* Localização */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span>{[lead.cidade, lead.estado].filter(Boolean).join(' — ') || '—'}</span>
                        </div>
                      </td>

                      {/* Contato */}
                      <td className="px-4 py-3">
                        {lead.telefone ? (
                          <button
                            onClick={e => { e.stopPropagation(); copyPhone(lead.telefone); }}
                            className="flex items-center gap-1 text-xs hover:text-primary transition-colors"
                            title="Clique para copiar"
                          >
                            <Phone className="h-3 w-3 shrink-0" />
                            {formatPhone(lead.telefone)}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">Sem telefone</span>
                        )}
                        {lead.email && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[140px]" title={lead.email}>{lead.email}</span>
                          </div>
                        )}
                      </td>

                      {/* Info */}
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {lead.data_abertura
                          ? `${new Date().getFullYear() - new Date(lead.data_abertura).getFullYear()} anos`
                          : '—'
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Página {page + 1} de {totalPages} ({total.toLocaleString()} resultados)
                {selectedMap.size > 0 && ` · ${selectedMap.size} selecionado${selectedMap.size !== 1 ? 's' : ''} no total`}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Dialog — Gerenciar Chaves CNPJA */}
      <Dialog open={keysDialogOpen} onOpenChange={setKeysDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Gerenciar Chaves CNPJA
            </DialogTitle>
            <DialogDescription>
              Adicione ou remova chaves da API CNPJA. Chaves de variáveis de ambiente só podem ser removidas pelo EasyPanel.
            </DialogDescription>
          </DialogHeader>

          {/* Lista de chaves */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {credits.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma chave cadastrada.</p>
            ) : (
              credits.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={c.credits > 0 ? 'secondary' : 'destructive'} className="shrink-0 text-xs">
                      {c.credits} crd
                    </Badge>
                    <span className="font-medium truncate">{c.label}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{c.key_hint}</span>
                    {c.source === 'env' && (
                      <Badge variant="outline" className="text-xs shrink-0">env</Badge>
                    )}
                  </div>
                  {c.can_delete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                      disabled={deletingKeyId === c.id}
                      onClick={() => handleDeleteKey(c.id)}
                    >
                      {deletingKeyId === c.id
                        ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />
                      }
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Adicionar nova chave */}
          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium">Adicionar nova chave</p>
            <div className="grid gap-2">
              <Label htmlFor="newKeyLabel" className="text-xs">Nome (opcional)</Label>
              <Input
                id="newKeyLabel"
                placeholder="Ex: Chave cliente X"
                value={newKeyLabel}
                onChange={e => setNewKeyLabel(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="newKeyValue" className="text-xs">Chave da API CNPJA</Label>
              <Input
                id="newKeyValue"
                type="password"
                placeholder="Cole a chave aqui..."
                value={newKeyValue}
                onChange={e => setNewKeyValue(e.target.value)}
                autoComplete="off"
              />
            </div>
            <Button onClick={handleAddKey} disabled={savingKey} className="w-full gap-2">
              {savingKey
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Salvando...</>
                : <><Plus className="h-4 w-4" /> Adicionar chave</>
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
