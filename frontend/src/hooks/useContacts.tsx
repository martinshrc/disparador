/**
 * useContacts — fonte de dados: PostgreSQL VPS (via backend API).
 * Auth permanece no Supabase; apenas a tabela contacts foi migrada para o VPS.
 *
 * Migração automática (uma única vez por usuário):
 *   Se o VPS retornar 0 contatos e o Supabase ainda tiver contatos,
 *   faz bulk-insert no VPS e seta a flag `contacts_migrated_<user_id>` no localStorage.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { apiClient } from '@/lib/apiClient';
import { DatabaseError, getErrorMessage } from '@/lib/errors';

export interface SavedContact {
  id: string;
  empresa: string;
  telefone: string;
  ultima_mensagem: string | null;
  ultima_mensagem_data: string | null;
  created_at: string;
  updated_at: string;
}

export function useContacts() {
  const [contacts, setContacts] = useState<SavedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // ─── Migração única do Supabase → VPS ──────────────────────────────────────
  async function migrateFromSupabaseIfNeeded(userId: string): Promise<void> {
    const flagKey = `contacts_migrated_${userId}`;
    if (localStorage.getItem(flagKey)) return; // já migrou

    try {
      const { data } = await supabase
        .from('contacts')
        .select('empresa, telefone')
        .order('created_at', { ascending: true });

      if (!data || data.length === 0) {
        localStorage.setItem(flagKey, '1');
        return;
      }

      await apiClient.post('/api/contacts/bulk', {
        user_id: userId,
        contacts: data,
      });

      localStorage.setItem(flagKey, '1');
      console.log(`[contacts] Migração Supabase → VPS: ${data.length} contatos importados.`);
    } catch (err) {
      console.warn('[contacts] Migração automática falhou (será tentada novamente):', err);
    }
  }

  // ─── Fetch do VPS ───────────────────────────────────────────────────────────
  const fetchContacts = useCallback(async () => {
    if (!user) {
      setContacts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Migração automática na primeira carga (só roda uma vez)
      await migrateFromSupabaseIfNeeded(user.id);

      const r = await apiClient.get(`/api/contacts?user_id=${encodeURIComponent(user.id)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: SavedContact[] = await r.json();
      setContacts(data);
    } catch (err) {
      console.error('[contacts] Erro ao carregar contatos:', err);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // ─── saveContact — upsert de contato único ──────────────────────────────────
  const saveContact = async (empresa: string, telefone: string): Promise<SavedContact> => {
    if (!user) throw new DatabaseError('Usuário não autenticado');
    if (!empresa || !telefone) throw new DatabaseError('Empresa e telefone são obrigatórios');

    const r = await apiClient.post('/api/contacts/bulk', {
      user_id: user.id,
      contacts: [{ empresa: empresa.trim(), telefone: telefone.trim() }],
    });
    if (!r.ok) throw new DatabaseError(`Erro ao salvar contato: HTTP ${r.status}`);

    // Retorna o contato recém salvo buscando pelo telefone
    await fetchContacts();
    const found = contacts.find(c => c.telefone === telefone.trim());
    if (!found) throw new DatabaseError('Contato salvo mas não encontrado após inserção');
    return found;
  };

  // ─── saveContactsFromFile — upsert em lote ──────────────────────────────────
  const saveContactsFromFile = async (contactsList: { empresa: string; telefone: string }[]) => {
    if (!user) throw new DatabaseError('Usuário não autenticado');
    if (!contactsList?.length) return;

    const valid = contactsList.filter(c => c.empresa && c.telefone);
    if (valid.length === 0) throw new DatabaseError('Nenhum contato válido para salvar');

    const r = await apiClient.post('/api/contacts/bulk', {
      user_id: user.id,
      contacts: valid,
    });

    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new DatabaseError(body.error || `Erro ao salvar contatos: HTTP ${r.status}`);
    }

    await fetchContacts();
  };

  // ─── updateContactMessage — persiste última mensagem enviada ────────────────
  const updateContactMessage = async (telefone: string, mensagem: string) => {
    if (!user) return null;

    const r = await apiClient.patch('/api/contacts/message', {
      user_id: user.id,
      telefone,
      mensagem,
    });

    if (!r.ok) {
      console.error('[contacts] Erro ao atualizar mensagem:', r.status);
      return null;
    }

    return await r.json();
  };

  // ─── desativarContacts — marca contatos como desativados no VPS (cross-device) ─
  const desativarContacts = async (ids: string[]): Promise<void> => {
    if (!user || ids.length === 0) return;
    await apiClient.patch('/api/contacts/desativar', { user_id: user.id, ids }).catch(() => {});
  };

  // ─── deleteContact ──────────────────────────────────────────────────────────
  const deleteContact = async (id: string): Promise<boolean> => {
    if (!user) return false;

    const r = await apiClient.delete(
      `/api/contacts/${id}?user_id=${encodeURIComponent(user.id)}`
    );

    if (!r.ok) {
      console.error('[contacts] Erro ao excluir contato:', r.status);
      return false;
    }

    setContacts(prev => prev.filter(c => c.id !== id));
    return true;
  };

  // ─── updateContact — edita empresa e telefone ───────────────────────────────
  const updateContact = async (id: string, empresa: string, telefone: string): Promise<boolean> => {
    if (!user) return false;

    const r = await apiClient.put(`/api/contacts/${id}`, {
      user_id: user.id,
      empresa,
      telefone,
    });

    if (!r.ok) {
      console.error('[contacts] Erro ao atualizar contato:', r.status);
      return false;
    }

    await fetchContacts();
    return true;
  };

  return {
    contacts,
    loading,
    saveContact,
    updateContactMessage,
    saveContactsFromFile,
    desativarContacts,
    deleteContact,
    updateContact,
    refreshContacts: fetchContacts,
    totalContacts: contacts.length,
  };
}
