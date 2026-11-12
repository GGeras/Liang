import { Injectable, computed, inject, signal } from '@angular/core';
import { erroDeRede, supabase } from './supabase';
import { AuthService } from './auth.service';
import { CatalogoService } from './catalogo.service';
import { AvisoVenda, FormaPagamento, ItemCarrinho, TipoPreco, VendaPendente, precoDe } from './models';
import { ler, salvar } from './cofre';

export type ResultadoVenda =
  | { status: 'registrada'; total: number; venda: VendaPendente }
  | { status: 'na_fila'; total: number; venda: VendaPendente }
  | { status: 'recusada'; motivo: string };

interface RespostaRpc {
  ok: boolean;
  erro?: string;
  total?: number;
  faltando?: { codigo?: string | null; codigo_barras?: string | null; produto?: string; variacao?: string; pedido?: number; disponivel?: number; erro?: string }[];
}

export function motivoRecusa(r: RespostaRpc): string {
  switch (r.erro) {
    case 'sem_estoque': {
      const itens = (r.faltando ?? [])
        .map((f) => (f.erro === 'item_inexistente' ? 'item removido do catálogo' : `${f.codigo ?? f.codigo_barras ?? ''} ${f.variacao}: pediu ${f.pedido}, havia ${f.disponivel}`))
        .join('; ');
      return `Estoque insuficiente (${itens}).`;
    }
    case 'cartao_so_varejo':
      return 'Cartão só é aceito no varejo.';
    case 'cliente_obrigatorio':
      return 'Informe o nome do cliente.';
    case 'venda_sem_itens':
      return 'Adicione ao menos um item.';
    case 'usuario_inativo':
      return 'Seu acesso está desativado.';
    case 'cliente_invalido':
      return 'Nome do cliente muito longo (máx. 120 caracteres).';
    case 'itens_demais':
      return 'Venda com itens demais (máx. 100).';
    case 'item_invalido':
      return 'Item com quantidade inválida.';
    case 'id_em_uso':
      return 'Identificador de venda já usado. Refaça a venda.';
    default:
      return r.erro ?? 'Erro desconhecido.';
  }
}

@Injectable({ providedIn: 'root' })
export class VendasService {
  private auth = inject(AuthService);
  private catalogo = inject(CatalogoService);

  /** Fila do aparelho inteiro (pode ter vendas de outro vendedor que usou o mesmo celular). */
  readonly fila = signal<VendaPendente[]>([]);
  readonly avisos = signal<AvisoVenda[]>([]);
  /** Só as vendas e avisos de quem está logado. */
  readonly minhaFila = computed(() => this.fila().filter((v) => v.vendedor_id === this.auth.perfil()?.id));
  readonly meusAvisos = computed(() =>
    this.avisos().filter((a) => !a.vendedor_id || a.vendedor_id === this.auth.perfil()?.id),
  );
  readonly sincronizando = signal(false);
  private iniciado = false;

  async iniciar() {
    if (this.iniciado) return;
    this.iniciado = true;
    this.fila.set(await ler<VendaPendente[]>('fila', []));
    this.avisos.set(await ler<AvisoVenda[]>('avisos', []));
    addEventListener('online', () => this.sincronizar());
    setInterval(() => this.sincronizar(), 30_000);
    await this.sincronizar();
  }

  async finalizar(
    carrinho: ItemCarrinho[],
    cliente: string,
    tipo: TipoPreco,
    pagamento: FormaPagamento,
  ): Promise<ResultadoVenda> {
    const perfil = this.auth.perfil();
    if (!perfil) return { status: 'recusada', motivo: 'Sessão expirada. Entre novamente.' };

    const venda: VendaPendente = {
      id: crypto.randomUUID(),
      vendedor_id: perfil.id,
      cliente: cliente.trim(),
      tipo_preco: tipo,
      pagamento,
      itens: carrinho.map((c) => ({
        variacao_id: c.item.variacao_id,
        quantidade: c.quantidade,
        codigo: c.item.codigo ?? c.item.codigo_barras,
        nome: `${c.item.nome} · ${c.item.variacao}`,
        produto: c.item.nome,
        variacao: c.item.variacao,
        preco_unitario: precoDe(c.item, tipo),
      })),
      vendedor_nome: perfil.nome,
      total_previsto: carrinho.reduce((s, c) => s + precoDe(c.item, tipo) * c.quantidade, 0),
      criada_em: new Date().toISOString(),
    };

    if (navigator.onLine) {
      try {
        const r = await this.enviar(venda, false);
        if (r.ok) {
          await this.catalogo.atualizar();
          return { status: 'registrada', total: Number(r.total ?? venda.total_previsto), venda };
        }
        return { status: 'recusada', motivo: motivoRecusa(r) };
      } catch (e) {
        if (!erroDeRede(e)) return { status: 'recusada', motivo: (e as Error).message };
      }
    }

    // Sem internet: guarda criptografado e baixa o estoque local
    await this.guardarFila([...this.fila(), venda]);
    await this.catalogo.baixarLocal(venda.itens);
    return { status: 'na_fila', total: venda.total_previsto, venda };
  }

  /**
   * Internet lenta: depois de 15 s a venda vai para a fila do aparelho em vez de
   * prender o vendedor em "Registrando…". Reenviar é seguro: o id é o mesmo e o
   * servidor reconhece a venda que já tiver chegado (não registra duas vezes).
   */
  private async enviar(v: VendaPendente, offline: boolean): Promise<RespostaRpc> {
    const { data, error } = await supabase.rpc('registrar_venda', {
      p_id: v.id,
      p_cliente: v.cliente,
      p_tipo_preco: v.tipo_preco,
      p_pagamento: v.pagamento,
      p_itens: v.itens.map((i) => ({ variacao_id: i.variacao_id, quantidade: i.quantidade })),
      p_criada_em: v.criada_em,
      p_offline: offline,
    }).abortSignal(AbortSignal.timeout(15_000));
    if (error) throw error;
    return data as RespostaRpc;
  }

  /**
   * Envia a fila em ordem. O servidor decide: quem chega primeiro leva o estoque.
   * A venda só sai da fila quando o servidor RESPONDEU (registrou ou recusou).
   * Erro técnico (sessão vencida, servidor fora, timeout) mantém a venda na fila
   * para nova tentativa — nunca se perde uma venda feita no balcão.
   */
  async sincronizar() {
    const perfil = this.auth.perfil();
    if (!perfil || !navigator.onLine || this.sincronizando() || this.minhaFila().length === 0) return;
    this.sincronizando.set(true);
    try {
      for (const v of [...this.minhaFila()]) {
        let r: RespostaRpc;
        try {
          r = await this.enviar(v, true);
        } catch (e) {
          if (erroDeRede(e)) break;
          const msg = (e as Error).message || 'Erro ao enviar';
          await this.guardarFila(this.fila().map((x) => (x.id === v.id ? { ...x, ultimo_erro: msg } : x)));
          continue;
        }
        if (!r.ok) {
          const aviso: AvisoVenda = { id: v.id, vendedor_id: v.vendedor_id, cliente: v.cliente, criada_em: v.criada_em, motivo: motivoRecusa(r) };
          this.avisos.update((a) => [aviso, ...a]);
          await salvar('avisos', this.avisos());
        }
        await this.guardarFila(this.fila().filter((x) => x.id !== v.id));
      }
      await this.catalogo.atualizar();
    } finally {
      this.sincronizando.set(false);
    }
  }

  async dispensarAviso(id: string) {
    this.avisos.update((a) => a.filter((x) => x.id !== id));
    await salvar('avisos', this.avisos());
  }

  private async guardarFila(f: VendaPendente[]) {
    this.fila.set(f);
    await salvar('fila', f);
  }
}
