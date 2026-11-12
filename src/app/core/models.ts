export type Papel = 'admin' | 'vendedor';
export type TipoPreco = 'atacado' | 'varejo';
export type FormaPagamento = 'dinheiro' | 'pix' | 'cartao';

export interface Perfil {
  id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
}

/** Uma linha da vw_catalogo: cada variação vendável. */
export interface ItemCatalogo {
  variacao_id: string;
  produto_id: string;
  /** 00-00 — só existe em produto SEM código de barras. */
  codigo: string | null;
  tipo_id: number;
  tipo: string;
  nome: string;
  marca: string | null;
  modelo: string | null;
  descricao: string | null;
  foto_url: string | null;
  variacao: string;
  preco_atacado: number;
  preco_varejo: number;
  codigo_barras: string | null;
  estoque_minimo: number;
  estoque: number;
  compativeis: string[];
}

export interface ItemCarrinho {
  item: ItemCatalogo;
  quantidade: number;
}

/** Venda guardada na fila do aparelho até sincronizar. */
export interface VendaPendente {
  id: string;
  vendedor_id: string;
  cliente: string;
  tipo_preco: TipoPreco;
  pagamento: FormaPagamento;
  itens: {
    variacao_id: string;
    quantidade: number;
    codigo: string | null;
    nome: string;
    /** Para a notinha (vendas guardadas antes desta versão não têm). */
    produto?: string;
    variacao?: string;
    tipo?: string;
    preco_unitario?: number;
  }[];
  total_previsto: number;
  vendedor_nome?: string;
  criada_em: string;
  /** Último erro técnico ao enviar (a venda continua na fila e é reenviada). */
  ultimo_erro?: string;
}

/** Aviso para o vendedor: venda offline recusada ao sincronizar. */
export interface AvisoVenda {
  id: string;
  /** Dono do aviso (o aparelho pode ser usado por mais de um vendedor). */
  vendedor_id?: string;
  cliente: string;
  criada_em: string;
  motivo: string;
}

export const PAGAMENTOS: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao: 'Cartão',
};

export function pagamentosPermitidos(tipo: TipoPreco): FormaPagamento[] {
  return tipo === 'atacado' ? ['dinheiro', 'pix'] : ['dinheiro', 'pix', 'cartao'];
}

export function precoDe(item: ItemCatalogo, tipo: TipoPreco): number {
  return tipo === 'atacado' ? Number(item.preco_atacado) : Number(item.preco_varejo);
}

/** Venda como vem do servidor (Minhas vendas, Vendas do admin, notinha). */
export interface VendaLinha {
  id: string;
  cliente_nome: string;
  tipo_preco: TipoPreco;
  forma_pagamento: FormaPagamento;
  total: number;
  status: 'concluida' | 'cancelada';
  criada_em: string;
  offline: boolean;
  motivo_cancelamento: string | null;
  vendedor?: { nome: string } | null;
  venda_itens: { quantidade: number; preco_unitario: number; variacoes: { nome: string; codigo_barras: string | null; produtos: { codigo: string | null; nome: string; tipos?: { nome: string } | null } } }[];
}

export const SELECT_VENDA =
  'id, cliente_nome, tipo_preco, forma_pagamento, total, status, criada_em, offline, motivo_cancelamento, estoque_devolvido, vendedor:perfis!vendas_vendedor_id_fkey(nome), venda_itens(quantidade, preco_unitario, variacoes(nome, codigo_barras, produtos(codigo, nome, tipos(nome))))';

/** Cabeçalho e rodapé da notinha (tabela `loja`, uma linha só). */
export interface DadosLoja {
  nome: string;
  endereco: string;
  telefone: string;
  rodape: string;
}

export const LOJA_PADRAO: DadosLoja = { nome: 'Mundo Mix', endereco: '', telefone: '', rodape: '' };

/** Tudo o que a notinha imprime, venha a venda do servidor ou da fila do aparelho. */
export interface NotinhaVenda {
  id: string;
  criada_em: string;
  vendedor: string;
  cliente: string;
  tipo_preco: TipoPreco;
  pagamento: FormaPagamento;
  /** `tipo`: nome do tipo (categoria); a notinha agrupa os itens por ele. */
  itens: { codigo: string | null; tipo?: string; nome: string; variacao: string; quantidade: number; preco_unitario: number }[];
  total: number;
  /** Venda feita sem internet que ainda não chegou ao servidor. */
  pendente: boolean;
  cancelada: boolean;
}
