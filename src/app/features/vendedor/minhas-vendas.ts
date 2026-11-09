import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { supabase, mensagemErro } from '../../core/supabase';
import { AuthService } from '../../core/auth.service';
import { VendasService } from '../../core/vendas.service';
import { PAGAMENTOS } from '../../core/models';
import { BrlPipe, DataHoraPipe, Icone, Toast } from '../../shared/ui';

export interface VendaLinha {
  id: string;
  cliente_nome: string;
  tipo_preco: 'atacado' | 'varejo';
  forma_pagamento: keyof typeof PAGAMENTOS;
  total: number;
  status: 'concluida' | 'cancelada';
  criada_em: string;
  offline: boolean;
  motivo_cancelamento: string | null;
  vendedor?: { nome: string } | null;
  venda_itens: { quantidade: number; preco_unitario: number; variacoes: { nome: string; produtos: { codigo: string; nome: string } } }[];
}

export const SELECT_VENDA =
  'id, cliente_nome, tipo_preco, forma_pagamento, total, status, criada_em, offline, motivo_cancelamento, estoque_devolvido, vendedor:perfis!vendas_vendedor_id_fkey(nome), venda_itens(quantidade, preco_unitario, variacoes(nome, produtos(codigo, nome)))';

@Component({
  selector: 'app-minhas-vendas',
  imports: [BrlPipe, DataHoraPipe, Icone],
  template: `
    <main class="pagina">
      <header class="cabecalho">
        <div>
          <h1>Minhas vendas</h1>
          <p class="muted small">{{ auth.perfil()?.nome }}</p>
        </div>
        <button class="btn sec pequeno" (click)="sair()"><i-con nome="sair" /> Sair</button>
      </header>

      @if (vendas.fila().length) {
        <section>
          <h2>Aguardando envio</h2>
          <ul class="lista fila">
            @for (v of vendas.fila(); track v.id) {
              <li><span>{{ v.cliente }}</span><span class="muted small">{{ v.criada_em | dataHora }}</span><strong class="num">{{ v.total_previsto | brl }}</strong></li>
            }
          </ul>
        </section>
      }

      @if (erro()) {
        <p class="erro-msg">{{ erro() }}</p>
      }

      <ul class="lista">
        @for (v of lista(); track v.id) {
          <li class="venda" [class.cancelada]="v.status === 'cancelada'">
            <div class="topo">
              <strong class="clamp-2">{{ v.cliente_nome }}</strong>
              <strong class="num">{{ v.total | brl }}</strong>
            </div>
            <span class="muted small">{{ v.criada_em | dataHora }} · {{ v.tipo_preco === 'atacado' ? 'Atacado' : 'Varejo' }} · {{ pag[v.forma_pagamento] }}</span>
            <ul class="itens">
              @for (i of v.venda_itens; track $index) {
                <li><span class="num">{{ i.quantidade }}×</span> <span class="clamp-2">{{ i.variacoes.produtos.codigo }} {{ i.variacoes.produtos.nome }} · {{ i.variacoes.nome }}</span></li>
              }
            </ul>
            @if (v.status === 'cancelada') {
              <p class="nota-cancelada">Cancelada: {{ v.motivo_cancelamento }}</p>
            }
          </li>
        } @empty {
          @if (!carregando()) {
            <li class="vazio">Você ainda não registrou vendas.</li>
          }
        }
      </ul>
      @if (temMais()) {
        <button class="btn sec" (click)="carregar()" [disabled]="carregando()">Carregar mais</button>
      }
    </main>
  `,
  styles: `
    h2 { margin-bottom: .5rem; }
    .fila li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .1rem .75rem; padding: .75rem 1rem; align-items: center; }
    .fila li > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fila li > .small { grid-row: 2; }
    .fila li > strong { grid-row: 1 / span 2; grid-column: 2; }
    .venda { display: grid; gap: .3rem; padding: .85rem 1rem; }
    .venda.cancelada { opacity: .7; }
    .topo { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem; align-items: start; }
    .itens { margin: .2rem 0 0; padding: 0; list-style: none; font-size: .88rem; display: grid; gap: .2rem; }
    .itens li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .4rem; }
  `,
})
export class MinhasVendas {
  protected auth = inject(AuthService);
  protected vendas = inject(VendasService);
  private toast = inject(Toast);
  private router = inject(Router);
  protected pag = PAGAMENTOS;
  protected lista = signal<VendaLinha[]>([]);
  protected carregando = signal(false);
  protected temMais = signal(false);
  protected erro = signal('');
  private pagina = 0;

  constructor() {
    this.carregar();
  }

  async carregar() {
    this.carregando.set(true);
    const passo = 30;
    const { data, error } = await supabase
      .from('vendas')
      .select(SELECT_VENDA)
      .eq('vendedor_id', this.auth.perfil()!.id)
      .order('criada_em', { ascending: false })
      .range(this.pagina * passo, this.pagina * passo + passo - 1);
    this.carregando.set(false);
    if (error) return this.erro.set(mensagemErro(error));
    this.pagina++;
    this.lista.update((l) => [...l, ...(data as unknown as VendaLinha[])]);
    this.temMais.set(data.length === passo);
  }

  async sair() {
    if (this.vendas.fila().length) {
      this.toast.mostrar('Há vendas guardadas sem envio. Conecte à internet antes de sair.', 'erro', 5000);
      return;
    }
    await this.auth.sair();
    this.router.navigateByUrl('/entrar');
  }
}
