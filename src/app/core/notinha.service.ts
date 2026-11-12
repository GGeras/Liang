import { ApplicationRef, ComponentRef, EnvironmentInjector, Injectable, createComponent, inject, signal } from '@angular/core';
import { supabase } from './supabase';
import { AuthService } from './auth.service';
import { CatalogoService } from './catalogo.service';
import { LojaService } from './loja.service';
import { VendasService } from './vendas.service';
import { NotinhaVenda, SELECT_VENDA, VendaLinha, VendaPendente, precoDe } from './models';
import { Notinha } from '../shared/notinha';

const PX_POR_MM = 96 / 25.4;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Venda do servidor → notinha. */
export function notinhaDeLinha(v: VendaLinha): NotinhaVenda {
  return {
    id: v.id,
    criada_em: v.criada_em,
    vendedor: v.vendedor?.nome ?? '',
    cliente: v.cliente_nome,
    tipo_preco: v.tipo_preco,
    pagamento: v.forma_pagamento,
    itens: v.venda_itens.map((i) => ({
      codigo: i.variacoes.produtos.codigo || i.variacoes.codigo_barras,
      nome: i.variacoes.produtos.nome,
      variacao: i.variacoes.nome,
      quantidade: i.quantidade,
      preco_unitario: Number(i.preco_unitario),
    })),
    total: Number(v.total),
    pendente: false,
    cancelada: v.status === 'cancelada',
  };
}

/**
 * Notinha: abre a simulação (o que vai sair no papel) e imprime.
 * A impressão monta a notinha num #impressao fora do app, mede a altura e
 * define a página com 80 mm de largura e exatamente essa altura.
 */
@Injectable({ providedIn: 'root' })
export class NotinhaService {
  private env = inject(EnvironmentInjector);
  private appRef = inject(ApplicationRef);
  private loja = inject(LojaService);
  private vendas = inject(VendasService);
  private catalogo = inject(CatalogoService);
  private auth = inject(AuthService);

  /** Notinha aberta na simulação (folha com Imprimir e Fechar). */
  readonly aberta = signal<NotinhaVenda | null>(null);
  private impressa?: { ref: ComponentRef<Notinha>; host: HTMLElement; pagina: HTMLStyleElement };
  private montando = false;

  abrir(n: NotinhaVenda) {
    this.aberta.set(n);
    this.loja.atualizar();
  }

  fechar() {
    this.aberta.set(null);
  }

  /** Venda da fila do aparelho (feita sem internet) → notinha. */
  dePendente(v: VendaPendente, pendente: boolean): NotinhaVenda {
    const cat = new Map(this.catalogo.itens().map((i) => [i.variacao_id, i]));
    const perfil = this.auth.perfil();
    return {
      id: v.id,
      criada_em: v.criada_em,
      vendedor: v.vendedor_nome ?? (perfil?.id === v.vendedor_id ? perfil.nome : ''),
      cliente: v.cliente,
      tipo_preco: v.tipo_preco,
      pagamento: v.pagamento,
      itens: v.itens.map((i) => {
        // Vendas guardadas antes da notinha não têm preço/variação separados
        const c = cat.get(i.variacao_id);
        const [produto, ...resto] = i.nome.split(' · ');
        return {
          codigo: i.codigo,
          nome: i.produto ?? produto,
          variacao: i.variacao ?? resto.join(' · '),
          quantidade: i.quantidade,
          preco_unitario: i.preco_unitario ?? (c ? precoDe(c, v.tipo_preco) : 0),
        };
      }),
      total: v.total_previsto,
      pendente,
      cancelada: false,
    };
  }

  /** Procura a venda: primeiro na fila do aparelho (pendente), depois no servidor. */
  async buscar(id: string): Promise<NotinhaVenda | null> {
    const naFila = this.vendas.fila().find((v) => v.id === id);
    if (naFila) return this.dePendente(naFila, true);
    if (!UUID.test(id)) return null;
    const { data, error } = await supabase.from('vendas').select(SELECT_VENDA).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? notinhaDeLinha(data as unknown as VendaLinha) : null;
  }

  async imprimir(venda: NotinhaVenda) {
    // Toque duplo em Imprimir: a primeira impressão ainda está sendo montada
    if (this.montando) return;
    this.montando = true;
    try {
      await this.montarEImprimir(venda);
    } finally {
      this.montando = false;
    }
  }

  private async montarEImprimir(venda: NotinhaVenda) {
    this.limpar();
    const host = document.createElement('div');
    host.id = 'impressao';
    host.setAttribute('aria-hidden', 'true');
    const el = document.createElement('app-notinha');
    host.appendChild(el);
    document.body.appendChild(host);
    const ref = createComponent(Notinha, { environmentInjector: this.env, hostElement: el });
    ref.setInput('venda', venda);
    ref.setInput('loja', this.loja.dados());
    this.appRef.attachView(ref.hostView);
    ref.changeDetectorRef.detectChanges();
    const pagina = document.createElement('style');
    pagina.id = 'pagina-notinha';
    // Registrada já: o que for montado aqui sempre sai na limpeza
    this.impressa = { ref, host, pagina };

    // A fonte muda a altura: mede só depois de carregada
    await document.fonts?.ready;
    const alturaMm = Math.ceil((host.getBoundingClientRect().height / PX_POR_MM) * 2) / 2;
    pagina.textContent = `@page { size: 80mm ${alturaMm}mm; margin: 0; }`;
    document.head.appendChild(pagina);

    addEventListener('afterprint', () => this.limpar(), { once: true });
    window.print();
  }

  private limpar() {
    if (!this.impressa) return;
    const { ref, host, pagina } = this.impressa;
    this.appRef.detachView(ref.hostView);
    ref.destroy();
    host.remove();
    pagina.remove();
    this.impressa = undefined;
  }
}
