import { ArrowLeft, Users, RefreshCw, Search, Calendar, MessageSquare, Trash2, Pencil, Download, RotateCcw, CheckSquare, Square } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
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
  const { fetchAllContacts, reativarContacts, deleteContact, updateContact } = useContacts();
  const [allContacts, setAllContacts] = useState<SavedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reativando, setReativando] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<SavedContact | null>(null);
  const [editForm, setEditForm] = useState({ empresa: '', telefone: '' });
  const { toast } = useToast();

  const loadAll = useCallback(async () => {
    setLoading(true);
    const data = await fetchAllContacts();
    setAllContacts(data);
    setLoading(false);
  }, [fetchAllContacts]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filteredContacts = allContacts.filter(
    (c) =>
      c.empresa.toLowerCase().includes(search.toLowerCase()) ||
      c.telefone.includes(search)
  );

  const activeCount    = allContacts.filter(c => !c.desativado).length;
  const removedCount   = allContacts.filter(c => c.desativado).length;

  // ── Seleção ────────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const toggleAll = () => {
    if (selected.size === filteredContacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const allSelected = filteredContacts.length > 0 && selected.size === filteredContacts.length;
  const someSelected = selected.size > 0 && !allSelected;

  // ── Readicionar ────────────────────────────────────────────────────────────
  const handleReativar = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setReativando(true);
    try {
      await reativarContacts(ids);
      await loadAll();
      setSelected(new Set());
      toast({
        title: `${ids.length} contato${ids.length !== 1 ? 's' : ''} readicionado${ids.length !== 1 ? 's' : ''} à fila de disparo`,
      });
    } catch {
      toast({ title: 'Erro ao readicionar', variant: 'destructive' });
    } finally {
      setReativando(false);
    }
  };

  // ── Excluir ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeleting(id);
    await deleteContact(id);
    setAllContacts(prev => prev.filter(c => c.id !== id));
    setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
    setDeleting(null);
  };

  // ── Editar ─────────────────────────────────────────────────────────────────
  const handleEditOpen = (contact: SavedContact) => {
    setEditingContact(contact);
    setEditForm({ empresa: contact.empresa, telefone: contact.telefone });
  };

  const handleEditSave = async () => {
    if (!editingContact) return;
    const success = await updateContact(editingContact.id, editForm.empresa, editForm.telefone);
    if (success) {
      toast({ title: 'Contato atualizado' });
      setEditingContact(null);
      await loadAll();
    } else {
      toast({ title: 'Erro ao atualizar', variant: 'destructive' });
    }
  };

  // ── Exportar ───────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (allContacts.length === 0) {
      toast({ title: 'Nenhum contato para exportar', variant: 'destructive' });
      return;
    }
    const data = allContacts.map((c) => ({
      Empresa: c.empresa,
      Telefone: c.telefone,
      Status: c.desativado ? 'Removido da fila' : 'Ativo',
      'Última Mensagem': c.ultima_mensagem || '',
      'Data Última Mensagem': c.ultima_mensagem_data
        ? new Date(c.ultima_mensagem_data).toLocaleString('pt-BR') : '',
      'Criado em': new Date(c.created_at).toLocaleDateString('pt-BR'),
    }));
    await exportToXlsx(data, 'Contatos', `contatos_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Exportação concluída', description: `${allContacts.length} contatos exportados.` });
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header style={{ top: 'var(--banner-h, 0px)' }} className="border-b bg-card/50 backdrop-blur-sm sticky z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <Button variant="ghost" size="icon" asChild className="shrink-0">
                <Link to="/"><ArrowLeft className="h-5 w-5" /></Link>
              </Button>
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-base sm:text-xl font-bold text-foreground leading-tight">Contatos Salvos</h1>
                  <p className="text-sm text-muted-foreground truncate">
                    {activeCount} ativos · {removedCount} fora da fila
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
              <CardTitle className="text-lg">Lista de Contatos</CardTitle>
              <Button variant="ghost" size="sm" onClick={loadAll} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <CardDescription>
              Todos os contatos da sua base — inclusive os removidos da fila de disparo
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por empresa ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Barra de ação de seleção */}
            {selected.size > 0 && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <span className="text-sm font-medium">
                  {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                    Limpar seleção
                  </Button>
                  <Button size="sm" onClick={handleReativar} disabled={reativando} className="gap-2">
                    <RotateCcw className="h-3.5 w-3.5" />
                    {reativando ? 'Readicionando...' : `Readicionar ao disparo (${selected.size})`}
                  </Button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando contatos...</div>
            ) : filteredContacts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {search ? 'Nenhum contato encontrado' : 'Nenhum contato salvo ainda'}
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-340px)]">
                {/* Cabeçalho com "selecionar todos" */}
                <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground border-b mb-1">
                  <div
                    className="cursor-pointer flex items-center"
                    onClick={toggleAll}
                  >
                    {allSelected
                      ? <CheckSquare className="h-4 w-4 text-primary" />
                      : someSelected
                        ? <CheckSquare className="h-4 w-4 text-muted-foreground opacity-50" />
                        : <Square className="h-4 w-4" />
                    }
                  </div>
                  <span>Empresa</span>
                </div>

                <div className="space-y-1">
                  {filteredContacts.map((contact, index) => (
                    <div
                      key={contact.id}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors cursor-pointer
                        ${contact.desativado
                          ? 'bg-muted/30 border-border/50 opacity-70'
                          : 'bg-card/50 hover:bg-card/80 border-border'}
                        ${selected.has(contact.id) ? 'ring-1 ring-primary' : ''}
                      `}
                      onClick={() => toggleSelect(contact.id)}
                    >
                      {/* Checkbox */}
                      <Checkbox
                        checked={selected.has(contact.id)}
                        onCheckedChange={() => toggleSelect(contact.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0"
                      />

                      {/* Número */}
                      <div className="w-6 text-center text-xs text-muted-foreground shrink-0">
                        {index + 1}
                      </div>

                      {/* Dados */}
                      <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-4 gap-1 md:gap-4 items-center">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-medium text-foreground truncate">{contact.empresa}</p>
                          {contact.desativado && (
                            <Badge variant="secondary" className="shrink-0 text-xs py-0">
                              Fora da fila
                            </Badge>
                          )}
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{contact.telefone}</p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3 shrink-0" />
                          Desde {formatDate(contact.created_at)}
                        </div>
                        <div className="truncate">
                          {contact.ultima_mensagem && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MessageSquare className="h-3 w-3 shrink-0" />
                              <span className="truncate">{contact.ultima_mensagem}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
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
                                Esta ação não pode ser desfeita. "{contact.empresa}" será removido permanentemente da base.
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

      {/* Edit Dialog */}
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
            <Button variant="outline" onClick={() => setEditingContact(null)}>Cancelar</Button>
            <Button onClick={handleEditSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
