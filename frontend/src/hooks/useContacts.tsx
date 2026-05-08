import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { DatabaseError, getErrorMessage, getErrorDetails } from '@/lib/errors';
import { withRetry, RetryConfigs } from '@/lib/retry';

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

  const fetchContacts = useCallback(async () => {
    if (!user) {
      setContacts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        const errorDetails = getErrorDetails(error);
        console.error('Error fetching contacts:', errorDetails);
        setContacts([]);
      } else {
        setContacts(data || []);
      }
    } catch (error) {
      const errorDetails = getErrorDetails(error);
      console.error('Unexpected error fetching contacts:', errorDetails);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const saveContact = async (empresa: string, telefone: string) => {
    if (!user) {
      throw new DatabaseError('Usuário não autenticado');
    }

    if (!empresa || !telefone) {
      throw new DatabaseError('Empresa e telefone são obrigatórios');
    }

    try {
      const { data, error } = await supabase
        .from('contacts')
        .upsert(
          {
            user_id: user.id,
            empresa: empresa.trim(),
            telefone: telefone.trim(),
          },
          { onConflict: 'user_id,telefone' }
        )
        .select()
        .single();

      if (error) {
        throw new DatabaseError(`Erro ao salvar contato: ${getErrorMessage(error)}`, error);
      }

      return data;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(`Erro inesperado ao salvar contato: ${getErrorMessage(error)}`, error);
    }
  };

  const updateContactMessage = async (telefone: string, mensagem: string) => {
    if (!user) return null;

    const { data, error } = await supabase
      .from('contacts')
      .update({
        ultima_mensagem: mensagem,
        ultima_mensagem_data: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('telefone', telefone)
      .select()
      .single();

    if (error) {
      console.error('Error updating contact message:', error);
      return null;
    }

    return data;
  };

  const saveContactsFromFile = async (contactsList: { empresa: string; telefone: string }[]) => {
    if (!user) throw new DatabaseError('Usuário não autenticado');
    if (!contactsList?.length) return;

    const contactsToInsert = contactsList
      .filter(c => c.empresa && c.telefone)
      .map((c) => ({
        user_id: user.id,
        empresa: c.empresa.trim(),
        telefone: c.telefone.trim(),
      }));

    if (contactsToInsert.length === 0) {
      throw new DatabaseError('Nenhum contato válido para salvar');
    }

    const retryResult = await withRetry(
      async () => {
        const { error } = await supabase
          .from('contacts')
          .upsert(contactsToInsert, { onConflict: 'user_id,telefone' });

        if (error) {
          throw new DatabaseError(`Erro ao salvar contatos: ${getErrorMessage(error)}`, error);
        }

        return true;
      },
      {
        ...RetryConfigs.database,
        onRetry: (attempt, error) => {
          console.warn(`Tentativa ${attempt} falhou, tentando novamente...`, error);
        },
      }
    );

    if (!retryResult.success) {
      const error = retryResult.lastError;
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(`Erro inesperado: ${retryResult.error || 'Erro desconhecido'}`, error);
    }

    await fetchContacts();
  };

  const deleteContact = async (id: string) => {
    if (!user) return false;

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting contact:', error);
      return false;
    }

    await fetchContacts();
    return true;
  };

  const updateContact = async (id: string, empresa: string, telefone: string) => {
    if (!user) return false;

    const { error } = await supabase
      .from('contacts')
      .update({ empresa, telefone })
      .eq('id', id);

    if (error) {
      console.error('Error updating contact:', error);
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
    deleteContact,
    updateContact,
    refreshContacts: fetchContacts,
    totalContacts: contacts.length,
  };
}
