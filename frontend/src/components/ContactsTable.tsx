import { useState, useMemo } from 'react';
import { RefreshCw, ArrowUpDown, ChevronLeft, ChevronRight, RotateCcw, Trash2, Search, Layers, Flame, CheckCircle, XCircle as XCircleIcon, Snowflake, MessageCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from './StatusBadge';
import { ContactRow } from '@/types/dispatcher';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const ITEMS_PER_PAGE = 100;

const STATUS_ORDER: Record<string, number> = {
  pendente: 0,
  gerando_ia: 1,
  enviando: 2,
  sucesso: 3,
  erro: 4,
};

export type FilterType =
  | 'todos'
  | 'primeiro'
  | 'ja-enviou'
  | 'funil-ativo'
  | 'funil-frio'
  | 'funil-qualificado'
  | 'funil-opt_out'
  | 'etapa-1'
  | 'etapa-2'
  | 'etapa-3';

export const FILTER_LABELS: Record<FilterType, string> = {
  todos:              'Todos',
  primeiro:           'Primeiro contato',
  'ja-enviou':        'Já enviou',
  'funil-ativo':      'Funil: Ativo',
  'funil-frio':       'Leads frios',
  'funil-qualificado':'Qualificados',
  'funil-opt_out':    'Opt-out',
  'etapa-1':          'Etapa 1',
  'etapa-2':          'Etapa 2',
  'etapa-3':          'Etapa 3',
};

/** Badge colorido para o status do funil */
function FunilBadge({ statusFunil, etapaFunil }: { statusFunil?: ContactRow['statusFunil']; etapaFunil?: ContactRow['etapaFunil'] }) {
  if (!statusFunil) return null;
  const map = {
    ativo:       { label: `E${etapaFunil ?? '?'}`, className: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
    frio:        { label: 'Frio',       className: 'bg-slate-500/15 text-slate-500 border-slate-500/30' },
    qualificado: { label: 'Qualif.',    className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
    opt_out:     { label: 'Opt-out',    className: 'bg-red-500/15 text-red-500 border-red-500/30' },
  } as const;
  const cfg = map[statusFunil];
  return (
    <span className={cn('inline-flex items-center rounded border px-1 py-0 text-[10px] font-medium ml-1.5', cfg.className)}>
      {cfg.label}
    </span>
  );
}

interface ContactsTableProps {
  contacts: ContactRow[];
  onRetry: (id: string) => void;
  onRetryAll: (ids: string[]) => void;
  onRemove: (id: string) => void;
  onRemoveSelected: (ids: string[]) => void;
  isRunning: boolean;
  currentIndex: number;
  /** Filtro ativo (controlado pelo Dashboard para sincronizar com o disparo) */
  filter: FilterType;
  onFilterChange: (f: FilterType) => void;
  segmentoFilter: string;
  onSegmentoFilterChange: (s: string) => void;
}

export function ContactsTable({ contacts, onRetry, onRetryAll, onRemove, onRemoveSelected, isRunning, currentIndex, filter, onFilterChange, segmentoFilter, onSegmentoFilterChange }: ContactsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortByStatus, setSortByStatus] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /** Lista de segmentos únicos presentes na lista (exclui vazios) */
  const segmentos = useMemo(() => {
    const s = new Set<string>();
    contacts.forEach(c => { if (c.segmento) s.add(c.segmento); });
    return [...s].sort();
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    let result = contacts;
    // Contato
    if (filter === 'primeiro')           result = result.filter(c => !c.jaEnviou && c.status !== 'sucesso');
    if (filter === 'ja-enviou')          result = result.filter(c => c.jaEnviou || c.status === 'sucesso');
    // Funil
    if (filter === 'funil-ativo')        result = result.filter(c => c.statusFunil === 'ativo');
    if (filter === 'funil-frio')         result = result.filter(c => c.statusFunil === 'frio');
    if (filter === 'funil-qualificado')  result = result.filter(c => c.statusFunil === 'qualificado');
    if (filter === 'funil-opt_out')      result = result.filter(c => c.statusFunil === 'opt_out');
    // Etapa
    if (filter === 'etapa-1')            result = result.filter(c => c.etapaFunil === 1);
    if (filter === 'etapa-2')            result = result.filter(c => c.etapaFunil === 2);
    if (filter === 'etapa-3')            result = result.filter(c => c.etapaFunil === 3);
    // Segmento
    if (segmentoFilter !== '_todos')     result = result.filter(c => c.segmento === segmentoFilter);
    // Busca
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(c =>
        c.empresa.toLowerCase().includes(q) ||
        c.telefoneFormatado.includes(q)
      );
    }
    return result;
  }, [contacts, filter, segmentoFilter, search]);

  const sortedContacts = useMemo(() => {
    if (!sortByStatus) return filteredContacts;
    return [...filteredContacts].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  }, [filteredContacts, sortByStatus]);

  const totalPages = Math.ceil(sortedContacts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedContacts = sortedContacts.slice(startIndex, endIndex);

  const handleSortToggle = () => {
    setSortByStatus(!sortByStatus);
    setCurrentPage(1);
  };

  const handleFilterChange = (f: FilterType) => {
    onFilterChange(f);
    setCurrentPage(1);
    setSelectedIds(new Set());
  };

  const handleSegmentoChange = (seg: string) => {
    onSegmentoFilterChange(seg);
    setCurrentPage(1);
    setSelectedIds(new Set());
  };

  /** Seleciona todos os contatos visíveis (filtrados + paginados) */
  const visibleIds = useMemo(() => sortedContacts.map(c => c.id), [sortedContacts]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some(id => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /** Seleciona todos os contatos de um segmento específico (ignora filtro atual) */
  const selectBySegmento = (seg: string) => {
    const ids = contacts.filter(c => c.segmento === seg).map(c => c.id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  };

  const handleRemoveSelected = () => {
    onRemoveSelected([...selectedIds]);
    setSelectedIds(new Set());
  };

  const countPrimeiro       = contacts.filter(c => !c.jaEnviou && c.status !== 'sucesso').length;
  const countJaEnviou       = contacts.filter(c => c.jaEnviou || c.status === 'sucesso').length;
  const countFunilAtivo     = contacts.filter(c => c.statusFunil === 'ativo').length;
  const countFunilFrio      = contacts.filter(c => c.statusFunil === 'frio').length;
  const countFunilQualif    = contacts.filter(c => c.statusFunil === 'qualificado').length;
  const countFunilOptOut    = contacts.filter(c => c.statusFunil === 'opt_out').length;
  const countEtapa1         = contacts.filter(c => c.etapaFunil === 1).length;
  const countEtapa2         = contacts.filter(c => c.etapaFunil === 2).length;
  const countEtapa3         = contacts.filter(c => c.etapaFunil === 3).length;
  /** Verdadeiro quando pelo menos um contato tem dados do funil */
  const hasFunilData        = contacts.some(c => c.statusFunil != null);

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <RefreshCw className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-1">Nenhum contato na lista</h3>
        <p className="text-sm text-muted-foreground">
          Use o card &quot;Upload de Contatos&quot; à esquerda para adicionar uma planilha (.xlsx ou .csv) com Empresa e Telefone.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header — filtros + busca */}
      <div className="space-y-2">
        {/* Linha 1: busca + filtros de contato + segmento + botão */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            <div className="relative w-full sm:w-52">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar empresa ou telefone..."
                className="pl-7 h-7 text-xs w-full"
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <div className="flex items-center gap-1">
              <Button variant={filter === 'todos' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => handleFilterChange('todos')}>
                Todos
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-xs">{contacts.length}</Badge>
              </Button>
              <Button variant={filter === 'primeiro' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => handleFilterChange('primeiro')}>
                <span className="hidden sm:inline">Primeiro contato</span>
                <span className="sm:hidden">1º</span>
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-xs">{countPrimeiro}</Badge>
              </Button>
              <Button variant={filter === 'ja-enviou' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => handleFilterChange('ja-enviou')}>
                <span className="hidden sm:inline">Já enviou</span>
                <span className="sm:hidden">Enviou</span>
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-xs">{countJaEnviou}</Badge>
              </Button>
            </div>
            {/* Filtro por segmento */}
            {segmentos.length > 0 && (
              <Select value={segmentoFilter} onValueChange={handleSegmentoChange}>
                <SelectTrigger className="h-7 text-xs w-44 gap-1">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Segmento..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_todos">Todos segmentos</SelectItem>
                  {segmentos.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isRunning || filteredContacts.length === 0} className="gap-1.5 h-7 text-xs">
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Reenviar selecionados</span>
                  <span className="sm:hidden">Reenviar</span>
                  ({filteredContacts.length})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reenviar {filteredContacts.length} contato{filteredContacts.length !== 1 ? 's' : ''} visíveis?</AlertDialogTitle>
                  <AlertDialogDescription className="text-destructive">
                    Serão resetados apenas os contatos visíveis no filtro atual. Incluindo os que já foram enviados.
                    <strong className="block mt-2">Isso pode se caracterizar como spam.</strong>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onRetryAll(filteredContacts.map(c => c.id))}>
                    Sim, reenviar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Linha 2: filtros de funil + etapa — aparece só quando há dados de prospecção */}
        {hasFunilData && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className="text-xs text-muted-foreground font-medium">Funil:</span>
            <Button
              variant={filter === 'funil-ativo' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => handleFilterChange('funil-ativo')}
            >
              <MessageCircle className="h-3 w-3" />
              Ativo
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">{countFunilAtivo}</Badge>
            </Button>
            <Button
              variant={filter === 'funil-frio' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => handleFilterChange('funil-frio')}
            >
              <Snowflake className="h-3 w-3" />
              Frio
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">{countFunilFrio}</Badge>
            </Button>
            <Button
              variant={filter === 'funil-qualificado' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => handleFilterChange('funil-qualificado')}
            >
              <CheckCircle className="h-3 w-3" />
              Qualificado
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">{countFunilQualif}</Badge>
            </Button>
            {countFunilOptOut > 0 && (
              <Button
                variant={filter === 'funil-opt_out' ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => handleFilterChange('funil-opt_out')}
              >
                <XCircleIcon className="h-3 w-3" />
                Opt-out
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">{countFunilOptOut}</Badge>
              </Button>
            )}

            <span className="text-xs text-muted-foreground font-medium ml-2">Etapa:</span>
            {countEtapa1 > 0 && (
              <Button
                variant={filter === 'etapa-1' ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => handleFilterChange('etapa-1')}
              >
                <Flame className="h-3 w-3" />
                E1
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">{countEtapa1}</Badge>
              </Button>
            )}
            {countEtapa2 > 0 && (
              <Button
                variant={filter === 'etapa-2' ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => handleFilterChange('etapa-2')}
              >
                <Flame className="h-3 w-3" />
                E2
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">{countEtapa2}</Badge>
              </Button>
            )}
            {countEtapa3 > 0 && (
              <Button
                variant={filter === 'etapa-3' ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => handleFilterChange('etapa-3')}
              >
                <Flame className="h-3 w-3" />
                E3
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">{countEtapa3}</Badge>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Barra de seleção em lote — aparece quando há selecionados */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size} empresa{selectedIds.size > 1 ? 's' : ''} selecionada{selectedIds.size > 1 ? 's' : ''}
            </span>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-muted-foreground" onClick={() => setSelectedIds(new Set())}>
              Limpar seleção
            </Button>
            {/* Selecionar por segmento — lista rápida */}
            {segmentos.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Layers className="h-3 w-3" />
                <span>Adicionar segmento:</span>
                {segmentos.map(s => (
                  <button
                    key={s}
                    onClick={() => selectBySegmento(s)}
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={isRunning} className="h-7 gap-1.5 text-xs">
                <Trash2 className="h-3.5 w-3.5" />
                Remover selecionadas ({selectedIds.size})
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover {selectedIds.size} empresa{selectedIds.size > 1 ? 's' : ''} da lista?</AlertDialogTitle>
                <AlertDialogDescription>
                  As empresas serão removidas apenas da lista de disparo atual. Contatos salvos no seu perfil não são afetados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleRemoveSelected} className="bg-destructive hover:bg-destructive/90">
                  Remover
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      <div className="rounded-lg border overflow-auto max-h-[400px]">
        <div className="min-w-[800px]">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-[40px] pl-3">
                  <Checkbox
                    checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleSelectAll}
                    disabled={isRunning}
                    aria-label="Selecionar todos visíveis"
                  />
                </TableHead>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead className="min-w-[120px]">Empresa</TableHead>
                <TableHead className="w-[140px]">Telefone</TableHead>
                <TableHead className="max-w-[300px]">Mensagem</TableHead>
                <TableHead className="w-[120px]">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSortToggle}
                    className={cn(
                      "h-auto p-0 gap-1 font-medium hover:bg-transparent",
                      sortByStatus && "text-primary"
                    )}
                  >
                    Status
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </Button>
                </TableHead>
                <TableHead className="w-[140px] text-right pr-4">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedContacts.map((contact, index) => {
                const realIndex = startIndex + index;
                return (
                  <TableRow
                    key={contact.id}
                    className={cn(
                      "transition-colors",
                      realIndex === currentIndex && isRunning && "bg-primary/5",
                      selectedIds.has(contact.id) && "bg-muted/40"
                    )}
                  >
                    <TableCell className="pl-3">
                      <Checkbox
                        checked={selectedIds.has(contact.id)}
                        onCheckedChange={() => toggleSelect(contact.id)}
                        disabled={isRunning}
                        aria-label={`Selecionar ${contact.empresa}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground text-sm">
                      {realIndex + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-0.5">
                        {contact.empresa}
                        <FunilBadge statusFunil={contact.statusFunil} etapaFunil={contact.etapaFunil} />
                        {contact.segmento && (
                          <span className="ml-2 text-xs text-muted-foreground/60 font-normal">{contact.segmento}</span>
                        )}
                        {contact.jaEnviou && !contact.statusFunil && (
                          <span className="ml-2 text-xs text-muted-foreground/60 font-normal">(já enviou)</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{contact.telefoneFormatado}</TableCell>
                    <TableCell className="max-w-[300px]">
                      {contact.mensagemIA ? (
                        <p className="text-sm text-muted-foreground truncate" title={contact.mensagemIA}>
                          {contact.mensagemIA}
                        </p>
                      ) : (
                        <span className="text-xs text-muted-foreground/60 italic">Aguardando...</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={contact.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRetry(contact.id)}
                          disabled={isRunning || contact.status === 'pendente'}
                          className="h-7 gap-1 text-xs px-2"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Reenviar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemove(contact.id)}
                          disabled={isRunning}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Remover da fila"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {startIndex + 1}-{Math.min(endIndex, sortedContacts.length)} de {sortedContacts.length} contatos
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <span className="text-muted-foreground px-2">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8 gap-1"
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
