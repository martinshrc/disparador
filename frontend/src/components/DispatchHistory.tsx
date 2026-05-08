import { History, RefreshCw, Loader2, Download } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from './StatusBadge';
import { DispatchRecord } from '@/hooks/useDispatchHistory';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { exportToXlsx } from '@/lib/exportXlsx';

interface DispatchHistoryProps {
  history: DispatchRecord[];
  loading: boolean;
  onRefresh: () => void;
}

export function DispatchHistory({ history, loading, onRefresh }: DispatchHistoryProps) {
  const mapStatus = (status: string) => {
    switch (status) {
      case 'success': return 'sucesso';
      case 'error': return 'erro';
      case 'cancelled': return 'cancelado';
      default: return status as any;
    }
  };

  const handleExport = async () => {
    if (history.length === 0) return;

    const exportData = history.map((record) => ({
      'Data/Hora': format(new Date(record.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }),
      'Empresa': record.empresa,
      'Telefone': record.telefone,
      'Status de envio': record.status === 'success' ? 'Sucesso' : record.status === 'error' ? 'Erro' : 'Cancelado',
    }));

    await exportToXlsx(exportData, 'Relatório', `relatorio_disparos_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`);
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Histórico de Envios</CardTitle>
              <CardDescription>
                {history.length > 0 
                  ? `${history.length} registros` 
                  : 'Nenhum envio registrado'}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExport}
              disabled={loading || history.length === 0}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" />
              Exportar
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onRefresh}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum disparo registrado ainda.</p>
            <p className="text-sm">Os envios aparecerão aqui após serem processados.</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {history.map((record) => (
                <div 
                  key={record.id}
                  className="p-3 rounded-lg bg-muted/50 border border-border/50 hover:bg-muted/70 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground truncate">
                          {record.empresa}
                        </span>
                        <StatusBadge status={mapStatus(record.status)} compact />
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {record.telefone}
                      </p>
                      {record.mensagem_ia && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {record.mensagem_ia}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(record.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
