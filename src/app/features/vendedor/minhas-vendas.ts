import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { supabase, mensagemErro } from '../../core/supabase';
import { AuthService } from '../../core/auth.service';
import { VendasService } from '../../core/vendas.service';
import { PAGAMENTOS, SELECT_VENDA, VendaLinha } from '../../core/models';
import { BrlPipe, DataHoraPipe, Icone, Toast } from '../../shared/ui';
import { NotinhaService, notinhaDeLinha } from '../../core/notinha.service';
import { SeletorIdioma } from '../../shared/idioma';
import { Ajuda } from '../../shared/ajuda';

@Component({
  selector: 'app-minhas-vendas',
  imports: [BrlPipe, DataHoraPipe, Icone, SeletorIdioma, Ajuda],
  template: `
    <main class="pagina">
      <header class="cabecalho">
        <div>
          <h1>Minhas vendas</h1>
          <p class="muted small">{{ auth.perfil()?.nome }}</p>
        </div>
        <button class="btn sec pequeno" (click)="sair()"><i-con nome="sair" /> Sair</button>
      </header>

      @if (vendas.minhaFila().length) {
        <section>
          <h2 class="rotulo-ajuda">Aguardando envio<app-ajuda sobre="Aguardando envio" texto="Vendas feitas sem internet: estão guardadas neste aparelho e são enviadas sozinhas quando a conexão voltar." /></h2>
          <ul class="lista fila">
            @for (v of vendas.minhaFila(); track v.id) {
              <li>
                <span>{{ v.cliente }}</span><span class="muted small">{{ v.criada_em | dataHora }}</span><strong class="num">{{ v.total_previsto | brl }}</strong>
                @if (v.ultimo_erro) {
                  <span class="erro-envio small">Ainda não enviada: {{ v.ultimo_erro }}. Tentando de novo; se persistir, entre novamente.</span>
                }
                <button type="button" class="btn sec pequeno reimprimir" (click)="notinha.abrir(notinha.dePendente(v, true))"><i-con nome="imprimir" /> Imprimir notinha</button>
              </li>
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
                <li><span class="num">{{ i.quantidade }}×</span> <span class="clamp-2">{{ i.variacoes.produtos.codigo || i.variacoes.codigo_barras }} {{ i.variacoes.produtos.nome }} · {{ i.variacoes.nome }}</span></li>
              }
            </ul>
            @if (v.status === 'cancelada') {
              <p class="nota-cancelada">Cancelada: {{ v.motivo_cancelamento }}</p>
            }
            <button type="button" class="btn sec pequeno reimprimir" (click)="notinha.abrir(deLinha(v))"><i-con nome="imprimir" /> Reimprimir</button>
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
      <app-idioma class="painel bloco-idioma" />
    </main>
  `,
  styles: `
    h2 { margin-bottom: .5rem; }
    .bloco-idioma { display: block; padding: .75rem 1rem; margin-top: 1.25rem; }
    .fila li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .1rem .75rem; padding: .75rem 1rem; align-items: center; }
    .fila li > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fila li > .small { grid-row: 2; }
    .fila li > strong { grid-row: 1 / span 2; grid-column: 2; }
    .fila .erro-envio { grid-column: 1 / -1; color: var(--danger); font-weight: 600; }
    .fila .reimprimir { grid-column: 1 / -1; }
    .reimprimir { justify-self: start; margin-top: .25rem; }
    .venda { display: grid; gap: .3rem; padding: .85rem 1rem; }
    .venda.cancelada .topo .num { text-decoration: line-through; color: var(--muted); }
    .topo { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem; align-items: start; }
    .itens { margin: .2rem 0 0; padding: 0; list-style: none; font-size: .88rem; display: grid; gap: .2rem; }
    .itens li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .4rem; }
  `,
})
export class MinhasVendas {
  protected auth = inject(AuthService);
  protected vendas = inject(VendasService);
  protected notinha = inject(NotinhaService);
  protected deLinha = notinhaDeLinha;
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
    if (this.vendas.minhaFila().length) {
      this.toast.mostrar('Há vendas guardadas sem envio. Conecte à internet antes de sair.', 'erro', 5000);
      return;
    }
    await this.auth.sair();
    this.router.navigateByUrl('/entrar');
  }
}
