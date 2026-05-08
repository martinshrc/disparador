export interface CnaeOption {
  id: number;
  label: string;
  category: string;
}

export const CNAES: CnaeOption[] = [
  // Alimentação
  { id: 5611201, label: 'Restaurantes e similares', category: 'Alimentação' },
  { id: 5611203, label: 'Lanchonetes e casas de suco', category: 'Alimentação' },
  { id: 5611204, label: 'Bares e similares', category: 'Alimentação' },
  { id: 5612100, label: 'Serviços ambulantes de alimentação', category: 'Alimentação' },
  { id: 5620101, label: 'Fornecimento de alimentos (buffet)', category: 'Alimentação' },
  { id: 1091101, label: 'Padaria e confeitaria', category: 'Alimentação' },
  { id: 4721102, label: 'Padaria e confeitaria (varejo)', category: 'Alimentação' },
  { id: 4722901, label: 'Açougue e peixaria', category: 'Alimentação' },

  // Saúde
  { id: 8630503, label: 'Clínicas médicas (ambulatorial)', category: 'Saúde' },
  { id: 8630504, label: 'Clínicas odontológicas', category: 'Saúde' },
  { id: 8640202, label: 'Laboratórios clínicos', category: 'Saúde' },
  { id: 8650001, label: 'Atividades de enfermagem', category: 'Saúde' },
  { id: 4771701, label: 'Farmácias e drogarias', category: 'Saúde' },
  { id: 7500100, label: 'Clínicas veterinárias', category: 'Saúde' },
  { id: 8690901, label: 'Fisioterapia e outras atividades de saúde', category: 'Saúde' },

  // Beleza e Estética
  { id: 9602501, label: 'Cabeleireiros', category: 'Beleza & Estética' },
  { id: 9602502, label: 'Manicure e pedicure', category: 'Beleza & Estética' },
  { id: 9602503, label: 'Institutos de beleza e estética', category: 'Beleza & Estética' },
  { id: 9609202, label: 'Aluguel de fantasias e afins', category: 'Beleza & Estética' },

  // Educação
  { id: 8511200, label: 'Educação infantil (creches e pré-escola)', category: 'Educação' },
  { id: 8512100, label: 'Ensino fundamental', category: 'Educação' },
  { id: 8513900, label: 'Ensino médio', category: 'Educação' },
  { id: 8541400, label: 'Educação profissional (cursos técnicos)', category: 'Educação' },
  { id: 8599604, label: 'Treinamento e desenvolvimento pessoal', category: 'Educação' },
  { id: 9313100, label: 'Academias de ginástica e musculação', category: 'Educação' },
  { id: 8550302, label: 'Atividades de apoio à educação (escolas de idioma)', category: 'Educação' },

  // Comércio
  { id: 4781400, label: 'Vestuário e acessórios (varejo)', category: 'Comércio' },
  { id: 4782201, label: 'Calçados (varejo)', category: 'Comércio' },
  { id: 4751201, label: 'Equipamentos e materiais para escritório', category: 'Comércio' },
  { id: 4712100, label: 'Minimercados e mercearias', category: 'Comércio' },
  { id: 4711301, label: 'Supermercados', category: 'Comércio' },
  { id: 4744001, label: 'Material de construção (varejo)', category: 'Comércio' },
  { id: 4763601, label: 'Livrarias', category: 'Comércio' },
  { id: 4789004, label: 'Artigos de caça, pesca e camping', category: 'Comércio' },

  // Serviços & TI
  { id: 6201501, label: 'Desenvolvimento de software customizado', category: 'Serviços & TI' },
  { id: 6201502, label: 'Web design', category: 'Serviços & TI' },
  { id: 7319002, label: 'Promoção de vendas e marketing digital', category: 'Serviços & TI' },
  { id: 6911701, label: 'Advocacia', category: 'Serviços & TI' },
  { id: 6920601, label: 'Contabilidade e auditoria', category: 'Serviços & TI' },
  { id: 7210000, label: 'Pesquisa e desenvolvimento', category: 'Serviços & TI' },
  { id: 8011101, label: 'Vigilância e segurança', category: 'Serviços & TI' },
  { id: 8121400, label: 'Limpeza em prédios e domicílios', category: 'Serviços & TI' },

  // Hospedagem & Turismo
  { id: 5510801, label: 'Hotéis', category: 'Hospedagem & Turismo' },
  { id: 5510802, label: 'Apart-hotéis', category: 'Hospedagem & Turismo' },
  { id: 5590601, label: 'Pousadas', category: 'Hospedagem & Turismo' },
  { id: 7911200, label: 'Agências de viagem', category: 'Hospedagem & Turismo' },
  { id: 7912100, label: 'Operadoras de turismo', category: 'Hospedagem & Turismo' },

  // Construção & Imóveis
  { id: 4120400, label: 'Construção de edifícios', category: 'Construção & Imóveis' },
  { id: 4321500, label: 'Instalação e manutenção elétrica', category: 'Construção & Imóveis' },
  { id: 4322301, label: 'Instalações hidráulicas', category: 'Construção & Imóveis' },
  { id: 6821801, label: 'Corretagem de imóveis', category: 'Construção & Imóveis' },
  { id: 4330404, label: 'Gesseiros e pintores', category: 'Construção & Imóveis' },

  // Transporte & Logística
  { id: 4930201, label: 'Transporte rodoviário de cargas', category: 'Transporte & Logística' },
  { id: 4921301, label: 'Transporte rodoviário (ônibus)', category: 'Transporte & Logística' },
  { id: 5232000, label: 'Atividades de agenciamento de carga', category: 'Transporte & Logística' },
  { id: 5229099, label: 'Mototaxistas e motoboys', category: 'Transporte & Logística' },
];

export const CNAE_CATEGORIES = [...new Set(CNAES.map(c => c.category))];

export const ESTADOS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO',
  'MA','MG','MS','MT','PA','PB','PE','PI','PR',
  'RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];
