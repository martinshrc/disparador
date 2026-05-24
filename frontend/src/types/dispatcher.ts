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
  /** segmento da empresa (ex: Restaurante, Clínica) — usado para seleção em lote */
  segmento?: string;
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
