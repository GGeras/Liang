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
  codigo: string;
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
  itens: { variacao_id: string; quantidade: number; codigo: string; nome: string }[];
  total_previsto: number;
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
