import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Tables } from '@/integrations/supabase/types';

export type WhatsAppInstance = Tables<'whatsapp_instances'>;

const CREATE_URL = import.meta.env.VITE_N8N_WEBHOOK_CREATE_URL as string;
const CHECK_STATUS_URL = import.meta.env.VITE_N8N_WEBHOOK_CHECK_STATUS_URL as string;
const DELETE_URL = import.meta.env.VITE_N8N_WEBHOOK_DELETE_URL as string;
const QRCODE_URL = import.meta.env.VITE_N8N_WEBHOOK_QRCODE_URL as string;

export function useWhatsAppInstances() {
  const { user } = useAuth();
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInstances = useCallback(async () => {
    if (!user) {
      setInstances([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching whatsapp_instances:', error);
        setInstances([]);
        return;
      }
      setInstances(data ?? []);
    } catch (err) {
      console.error('Unexpected error:', err);
      setInstances([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('whatsapp_instances')
      .on(
        'postgres_changes',
        {
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchInstances();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchInstances]);

  const insertInstance = useCallback(
    async (instanceName: string) => {
      if (!user) throw new Error('Usuário não autenticado');
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .insert({
          user_id: user.id,
          instance_name: instanceName,
          status: 'creating',
        })
        .select()
        .single();
      if (error) throw error;
      return data as WhatsAppInstance;
    },
    [user]
  );

  const updateInstance = useCallback(
    async (id: string, updates: { status?: string; qrcode_base64?: string | null }) => {
      if (!user) throw new Error('Usuário não autenticado');
      const { error } = await supabase
        .from('whatsapp_instances')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    [user]
  );

  const deleteInstance = useCallback(
    async (id: string) => {
      if (!user) throw new Error('Usuário não autenticado');
      const { error } = await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    [user]
  );

  return {
    instances,
    loading,
    insertInstance,
    updateInstance,
    deleteInstance,
    refreshInstances: fetchInstances,
    webhookUrls: { CREATE_URL, CHECK_STATUS_URL, DELETE_URL, QRCODE_URL },
  };
}
