export interface ContactRow {
  id: string;
  empresa: string;
  telefone: string;
  telefoneFormatado: string;
  mensagemIA: string;
  status: 'pendente' | 'gerando-ia' | 'enviando' | 'sucesso' | 'erro';
  erro?: string;
  /** true se já foi disparado em sessão anterior (ultima_mensagem_data preenchido no Supabase) */
  jaEnviou?: boolean;
  /** Data do último disparo (ISO string) — base para filtros de "frio" */
  ultimaMensagemData?: string | null;
  /** segmento da empresa (ex: Restaurante, Clínica) — usado para seleção em lote */
  segmento?: string;
  /** Etapa do funil de prospecção (1, 2 ou 3) — vem de blitzar_prospeccao */
  etapaFunil?: 1 | 2 | 3 | null;
  /** Status no funil de prospecção — vem de blitzar_prospeccao */
  statusFunil?: 'ativo' | 'qualificado' | 'frio' | 'opt_out' | null;
  /** Total de respostas recebidas no funil */
  totalRespostas?: number;
}

export interface DispatcherState {
  contacts: ContactRow[];
  mensagemBase: string;
  isRunning: boolean;
  currentIndex: number;
  countdown: number;
  totalEnviados: number;
  totalErros: number;
}
