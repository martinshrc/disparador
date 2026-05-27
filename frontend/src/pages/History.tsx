import { ArrowLeft, History, RefreshCw, Download, Search, Loader2, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from '@/components/StatusBadge';
import { useDispatchHistory } from '@/hooks/useDispatchHistory';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { exportToXlsx } from '@/lib/exportXlsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ITEMS_PER_PAGE = 100;

export default function HistoryPage() {
  const { history, loading, refreshHistory } = useDispatchHistory();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error' | 'cancelled'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();

  const filteredHistory = useMemo(() => {
    let filtered = history;

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter((h) => h.status === statusFilter);
    }

    // Filter by search
    if (search) {
      filtered = filtered.filter(
        (h) =>
          h.empresa.toLowerCase().includes(search.toLowerCase()) ||
          h.telefone.includes(search)
      );
    }

    return filtered;
  }, [history, statusFilter, search]);

  const totalPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE);
  const paginatedHistory = filteredHistory.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleFilterChange = (value: 'all' | 'success' | 'error' | 'cancelled') => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const mapStatus = (status: string) => {
    switch (status) {
      case 'success': return 'sucesso';
      case 'error': return 'erro';
      case 'cancelled': return 'cancelado';
      default: return status as any;
    }
  };

  const handleExport = async () => {
    if (history.length === 0) {
      toast({ title: 'Nenhum registro', description: 'Não há registros para exportar.', variant: 'destructive' });
      return;
    }

    const exportData = filteredHistory.map((record) => ({
      'Data/Hora': format(new Date(record.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }),
      'Empresa': record.empresa,
      'Telefone': record.telefone,
      'Mensagem Base': record.mensagem_base,
      'Mensagem IA': record.mensagem_ia || '',
      'Status': record.status === 'success' ? 'Sucesso' : record.status === 'error' ? 'Erro' : record.status === 'cancelled' ? 'Cancelado' : record.status,
      'Erro': record.error_message || '',
    }));

    await exportToXlsx(exportData, 'Histórico', `historico_envios_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`);
    toast({ title: 'Exportação concluída', description: `${filteredHistory.length} registros exportados.` });
  };

  const successCount = history.filter((h) => h.status === 'success').length;
  const errorCount = history.filter((h) => h.status === 'error').length;
  const cancelledCount = history.filter((h) => h.status === 'cancelled').length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <Button variant="ghost" size="icon" asChild className="shrink-0">
                <Link to="/">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
                  <History className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-base sm:text-xl font-bold text-foreground leading-tight">Histórico de Envios</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">
                    {history.length} registros • {successCount} sucesso • {errorCount} erro{cancelledCount > 0 ? ` • ${cancelledCount} cancelado` : ''}
                  </p>
                </div>
              </div>
            </div>
            <Button onClick={handleExport} className="gap-2 shrink-0">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Lista de Envios</CardTitle>
              <Button variant="ghost" size="sm" onClick={refreshHistory} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <CardDescription>
              Visualize todos os disparos realizados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por empresa ou telefone..."
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={handleFilterChange}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filtrar status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos ({history.length})</SelectItem>
                  <SelectItem value="success">Sucesso ({successCount})</SelectItem>
                  <SelectItem value="error">Erro ({errorCount})</SelectItem>
                  {cancelledCount > 0 && <SelectItem value="cancelled">Cancelado ({cancelledCount})</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : paginatedHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {search || statusFilter !== 'all' ? 'Nenhum registro encontrado' : 'Nenhum envio registrado ainda'}
              </div>
            ) : (
              <>
                <ScrollArea className="h-[calc(100vh-380px)]">
                  <div className="space-y-2">
                    {paginatedHistory.map((record, index) => (
                      <div
                        key={record.id}
                        className="flex items-center gap-4 p-4 rounded-lg border bg-card/50 hover:bg-card/80 transition-colors"
                      >
                        <div className="w-8 text-center text-sm text-muted-foreground font-medium">
                          {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                        </div>
                        <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-5 gap-2 md:gap-4 items-center">
                          <div className="truncate">
                            <p className="font-medium text-foreground truncate">{record.empresa}</p>
                          </div>
                          <div>
                            <StatusBadge status={mapStatus(record.status)} compact />
                          </div>
                          <div className="truncate">
                            <p className="text-sm text-muted-foreground">{record.telefone}</p>
                          </div>
                          <div className="truncate md:col-span-2">
                            {record.mensagem_ia && (
                              <p className="text-xs text-muted-foreground truncate">{record.mensagem_ia}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(record.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t">
                    <span className="text-sm text-muted-foreground">
                      {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredHistory.length)} de {filteredHistory.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Anterior
                      </Button>
                      <span className="text-sm text-muted-foreground px-2">
                        {currentPage} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Próximo
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
