import { Injectable, inject, signal } from '@angular/core';
import { supabase } from './supabase';
import { AuthService } from './auth.service';
import { CatalogoService } from './catalogo.service';
import { AvisoVenda, FormaPagamento, ItemCarrinho, TipoPreco, VendaPendente, precoDe } from './models';
import { ler, salvar } from './cofre';

export type ResultadoVenda =
  | { status: 'registrada'; total: number }
  | { status: 'na_fila'; total: number }
  | { status: 'recusada'; motivo: string };

interface RespostaRpc {
  ok: boolean;
  erro?: string;
  total?: number;
  faltando?: { codigo?: string; produto?: string; variacao?: string; pedido?: number; disponivel?: number; erro?: string }[];
}

function erroDeRede(e: unknown) {
  const m = (e as { message?: string })?.message ?? '';
  return !navigator.onLine || /Failed to fetch|NetworkError|Load failed|fetch/i.test(m);
}

export function motivoRecusa(r: RespostaRpc): string {
  switch (r.erro) {
    case 'sem_estoque': {
      const itens = (r.faltando ?? [])
        .map((f) => (f.erro === 'item_inexistente' ? 'item removido do catálogo' : `${f.codigo} ${f.variacao}: pediu ${f.pedido}, havia ${f.disponivel}`))
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
    default:
      return r.erro ?? 'Erro desconhecido.';
  }
}

@Injectable({ providedIn: 'root' })
export class VendasService {
  private auth = inject(AuthService);
  private catalogo = inject(CatalogoService);

  readonly fila = signal<VendaPendente[]>([]);
  readonly avisos = signal<AvisoVenda[]>([]);
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
        codigo: c.item.codigo,
        nome: `${c.item.nome} · ${c.item.variacao}`,
      })),
      total_previsto: carrinho.reduce((s, c) => s + precoDe(c.item, tipo) * c.quantidade, 0),
      criada_em: new Date().toISOString(),
    };

    if (navigator.onLine) {
      try {
        const r = await this.enviar(venda, false);
        if (r.ok) {
          await this.catalogo.atualizar();
          return { status: 'registrada', total: Number(r.total ?? venda.total_previsto) };
        }
        return { status: 'recusada', motivo: motivoRecusa(r) };
      } catch (e) {
        if (!erroDeRede(e)) return { status: 'recusada', motivo: (e as Error).message };
      }
    }

    // Sem internet: guarda criptografado e baixa o estoque local
    await this.guardarFila([...this.fila(), venda]);
    await this.catalogo.baixarLocal(venda.itens);
    return { status: 'na_fila', total: venda.total_previsto };
  }

  private async enviar(v: VendaPendente, offline: boolean): Promise<RespostaRpc> {
    const { data, error } = await supabase.rpc('registrar_venda', {
      p_id: v.id,
      p_cliente: v.cliente,
      p_tipo_preco: v.tipo_preco,
      p_pagamento: v.pagamento,
      p_itens: v.itens.map((i) => ({ variacao_id: i.variacao_id, quantidade: i.quantidade })),
      p_criada_em: v.criada_em,
      p_offline: offline,
    });
    if (error) throw error;
    return data as RespostaRpc;
  }

  /** Envia a fila em ordem. O servidor decide: quem chega primeiro leva o estoque. */
  async sincronizar() {
    const perfil = this.auth.perfil();
    if (!perfil || !navigator.onLine || this.sincronizando() || this.fila().length === 0) return;
    this.sincronizando.set(true);
    try {
      for (const v of [...this.fila()]) {
        if (v.vendedor_id !== perfil.id) continue;
        let r: RespostaRpc;
        try {
          r = await this.enviar(v, true);
        } catch (e) {
          if (erroDeRede(e)) break;
          r = { ok: false, erro: (e as Error).message };
        }
        if (!r.ok) {
          const aviso: AvisoVenda = { id: v.id, cliente: v.cliente, criada_em: v.criada_em, motivo: motivoRecusa(r) };
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
