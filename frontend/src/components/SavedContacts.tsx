import { useState } from 'react';
import { Users, Calendar, MessageSquare, Trash2, RefreshCw, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SavedContact } from '@/hooks/useContacts';
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

interface SavedContactsProps {
  contacts: SavedContact[];
  loading: boolean;
  onRefresh: () => void;
  onDelete: (id: string) => Promise<boolean>;
}

export function SavedContacts({ contacts, loading, onRefresh, onDelete }: SavedContactsProps) {
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const filteredContacts = contacts.filter(
    (c) =>
      c.empresa.toLowerCase().includes(search.toLowerCase()) ||
      c.telefone.includes(search)
  );

  const handleDelete = async (id: string) => {
    setDeleting(id);
    await onDelete(id);
    setDeleting(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Contatos Salvos</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <CardDescription>
          {contacts.length} contatos salvos na sua base
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por empresa ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Carregando contatos...
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {search ? 'Nenhum contato encontrado' : 'Nenhum contato salvo ainda'}
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {filteredContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="p-3 rounded-lg border bg-card/50 hover:bg-card/80 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {contact.empresa}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {contact.telefone}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Desde {formatDate(contact.created_at)}
                        </span>
                      </div>
                      {contact.ultima_mensagem && (
                        <div className="mt-2 p-2 rounded bg-muted/50 text-xs">
                          <div className="flex items-center gap-1 text-muted-foreground mb-1">
                            <MessageSquare className="h-3 w-3" />
                            Última mensagem ({formatDateTime(contact.ultima_mensagem_data)}):
                          </div>
                          <p className="text-foreground line-clamp-2">
                            {contact.ultima_mensagem}
                          </p>
                        </div>
                      )}
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          disabled={deleting === contact.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. O contato "{contact.empresa}" será removido permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(contact.id)}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
