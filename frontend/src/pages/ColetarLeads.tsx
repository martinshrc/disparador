import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Search, RefreshCw, Building2,
  Phone, Mail, MapPin, Zap, Database, ChevronLeft, ChevronRight,
  SendHorizontal, ChevronsUpDown, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
}

interface CreditInfo {
  index: number;
  credits: number;
  key_hint: string;
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

  // Selection for dispatch
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addingToDispatch, setAddingToDispatch] = useState(false);

  // Credits
  const [credits, setCredits] = useState<CreditInfo[]>([]);
  const [totalCredits, setTotalCredits] = useState<number | null>(null);

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
  }, [page, selectedCnae, selectedEstado, searchText]);

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
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map(l => l.id)));
    }
  }

  // ─── Adicionar leads ao disparo (Supabase contacts) ─────────────────────
  async function handleAddToDispatch() {
    if (selected.size === 0) return;
    setAddingToDispatch(true);
    try {
      const toAdd = leads
        .filter(l => selected.has(l.id) && l.telefone)
        .map(l => ({
          empresa: l.nome_fantasia || l.razao_social,
          telefone: l.telefone!.replace(/\D/g, ''),
        }));

      if (toAdd.length === 0) {
        toast({ title: 'Nenhum lead selecionado possui telefone', variant: 'destructive' });
        return;
      }

      await saveContactsFromFile(toAdd);
      toast({ title: `${toAdd.length} empresa(s) adicionadas ao disparo!` });
      setSelected(new Set());
    } catch (e: any) {
      toast({ title: 'Erro ao adicionar ao disparo', description: e.message, variant: 'destructive' });
    } finally {
      setAddingToDispatch(false);
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

    const resp = await apiClient.stream('/api/leads/fetch', {
      estado: selectedEstado, cnae: selectedCnae, limite,
    });

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
  const cnaeInfo = CNAES.find(c => String(c.id) === selectedCnae);

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

            <div className="flex items-end">
              <Button onClick={handleFetch} disabled={isFetching} className="gap-2">
                {isFetching
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Buscando...</>
                  : <><Search className="h-4 w-4" /> Buscar empresas</>
                }
              </Button>
            </div>
          </div>

          {/* Créditos por chave */}
          {credits.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {credits.map(c => (
                <Badge key={c.index} variant={c.credits > 0 ? 'secondary' : 'destructive'} className="text-xs">
                  Chave {c.index}: {c.credits} crédito{c.credits !== 1 ? 's' : ''}
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
            <div className="flex items-center gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4" />
                Pool de leads
                {total > 0 && <Badge variant="secondary">{total.toLocaleString()} empresas</Badge>}
              </CardTitle>
              {selected.size > 0 && (
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
                  Disparar {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
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
                        checked={leads.length > 0 && selected.size === leads.length}
                        onCheckedChange={toggleSelectAll}
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
                      className={`border-b hover:bg-muted/20 transition-colors cursor-pointer ${selected.has(lead.id) ? 'bg-primary/5' : idx % 2 === 0 ? '' : 'bg-muted/5'}`}
                      onClick={() => toggleSelect(lead.id)}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(lead.id)}
                          onCheckedChange={() => toggleSelect(lead.id)}
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
                            onClick={() => copyPhone(lead.telefone)}
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
    </div>
  );
}
