import { useState, useMemo } from 'react';
import { RefreshCw, ArrowUpDown, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
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

interface ContactsTableProps {
  contacts: ContactRow[];
  onRetry: (id: string) => void;
  onRetryAll: () => void;
  isRunning: boolean;
  currentIndex: number;
}

export function ContactsTable({ contacts, onRetry, onRetryAll, isRunning, currentIndex }: ContactsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortByStatus, setSortByStatus] = useState(false);

  const sortedContacts = useMemo(() => {
    if (!sortByStatus) return contacts;
    return [...contacts].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  }, [contacts, sortByStatus]);

  const totalPages = Math.ceil(sortedContacts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedContacts = sortedContacts.slice(startIndex, endIndex);

  const handleSortToggle = () => {
    setSortByStatus(!sortByStatus);
    setCurrentPage(1);
  };

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
      {/* Header with Retry All button */}
      <div className="flex justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isRunning || contacts.length === 0}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reenviar Todos
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reenviar para todos os contatos?</AlertDialogTitle>
              <AlertDialogDescription className="text-destructive">
                Tem certeza que deseja reenviar para todos? Até para os que já foram enviados? 
                <strong className="block mt-2">Isso pode se caracterizar como spam.</strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={onRetryAll}>
                Sim, reenviar todos
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="rounded-lg border overflow-auto max-h-[400px]">
        <div className="min-w-[800px]">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
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
                <TableHead className="w-[100px] text-right pr-4">Ação</TableHead>
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
                      realIndex === currentIndex && isRunning && "bg-primary/5"
                    )}
                  >
                    <TableCell className="font-mono text-muted-foreground text-sm">
                      {realIndex + 1}
                    </TableCell>
                    <TableCell className="font-medium">{contact.empresa}</TableCell>
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRetry(contact.id)}
                        disabled={isRunning || contact.status === 'pendente'}
                        className="h-8 gap-1.5 text-xs"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Reenviar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination Controls */}
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
