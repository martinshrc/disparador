import { ArrowLeft, Users, RefreshCw, Search, Calendar, MessageSquare, Trash2, Pencil, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useContacts, SavedContact } from '@/hooks/useContacts';
import { useToast } from '@/hooks/use-toast';
import { exportToXlsx } from '@/lib/exportXlsx';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

export default function Contacts() {
  const { contacts, loading, refreshContacts, deleteContact, updateContact } = useContacts();
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<SavedContact | null>(null);
  const [editForm, setEditForm] = useState({ empresa: '', telefone: '' });
  const { toast } = useToast();

  const filteredContacts = contacts.filter(
    (c) =>
      c.empresa.toLowerCase().includes(search.toLowerCase()) ||
      c.telefone.includes(search)
  );

  const handleDelete = async (id: string) => {
    setDeleting(id);
    await deleteContact(id);
    setDeleting(null);
  };

  const handleEditOpen = (contact: SavedContact) => {
    setEditingContact(contact);
    setEditForm({ empresa: contact.empresa, telefone: contact.telefone });
  };

  const handleEditSave = async () => {
    if (!editingContact) return;
    const success = await updateContact(editingContact.id, editForm.empresa, editForm.telefone);
    if (success) {
      toast({ title: 'Contato atualizado', description: 'As alterações foram salvas.' });
      setEditingContact(null);
    } else {
      toast({ title: 'Erro', description: 'Não foi possível atualizar o contato.', variant: 'destructive' });
    }
  };

  const handleExport = async () => {
    if (contacts.length === 0) {
      toast({ title: 'Nenhum contato', description: 'Não há contatos para exportar.', variant: 'destructive' });
      return;
    }

    const data = contacts.map((c) => ({
      Empresa: c.empresa,
      Telefone: c.telefone,
      'Última Mensagem': c.ultima_mensagem || '',
      'Data Última Mensagem': c.ultima_mensagem_data
        ? new Date(c.ultima_mensagem_data).toLocaleString('pt-BR')
        : '',
      'Criado em': new Date(c.created_at).toLocaleDateString('pt-BR'),
    }));

    await exportToXlsx(data, 'Contatos', `contatos_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Exportação concluída', description: `${contacts.length} contatos exportados.` });
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
    <div className="min-h-screen bg-background">
      <header style={{ top: 'var(--banner-h, 0px)' }} className="border-b bg-card/50 backdrop-blur-sm sticky z-40">
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
                  <Users className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-base sm:text-xl font-bold text-foreground leading-tight">Contatos Salvos</h1>
                  <p className="text-sm text-muted-foreground truncate">{contacts.length} contatos na sua base</p>
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
              <CardTitle className="text-lg">Lista de Contatos</CardTitle>
              <Button variant="ghost" size="sm" onClick={refreshContacts} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <CardDescription>
              Gerencie todos os contatos salvos na sua base de dados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
              <ScrollArea className="h-[calc(100vh-300px)]">
                <div className="space-y-2">
                  {filteredContacts.map((contact, index) => (
                    <div
                      key={contact.id}
                      className="flex items-center gap-4 p-4 rounded-lg border bg-card/50 hover:bg-card/80 transition-colors"
                    >
                      <div className="w-8 text-center text-sm text-muted-foreground font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-4 gap-2 md:gap-4 items-center">
                        <div className="truncate">
                          <p className="font-medium text-foreground truncate">{contact.empresa}</p>
                        </div>
                        <div className="truncate">
                          <p className="text-sm text-muted-foreground">{contact.telefone}</p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          Desde {formatDate(contact.created_at)}
                        </div>
                        <div className="truncate">
                          {contact.ultima_mensagem && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MessageSquare className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{contact.ultima_mensagem}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => handleEditOpen(contact)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
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
      </main>

      {/* Edit Contact Dialog */}
      <Dialog open={!!editingContact} onOpenChange={(open) => !open && setEditingContact(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Contato</DialogTitle>
            <DialogDescription>Atualize as informações do contato.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="empresa">Empresa</Label>
              <Input
                id="empresa"
                value={editForm.empresa}
                onChange={(e) => setEditForm((f) => ({ ...f, empresa: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                value={editForm.telefone}
                onChange={(e) => setEditForm((f) => ({ ...f, telefone: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingContact(null)}>
              Cancelar
            </Button>
            <Button onClick={handleEditSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
