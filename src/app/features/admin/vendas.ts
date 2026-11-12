import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { supabase, mensagemErro } from '../../core/supabase';
import { CatalogoService } from '../../core/catalogo.service';
import { PAGAMENTOS, SELECT_VENDA, VendaLinha } from '../../core/models';
import { BrlPipe, DataHoraPipe, Icone, Toast } from '../../shared/ui';
import { NotinhaService, notinhaDeLinha } from '../../core/notinha.service';
import { Ajuda } from '../../shared/ajuda';

@Component({
  selector: 'app-vendas-admin',
  imports: [FormsModule, BrlPipe, DataHoraPipe, Icone, Ajuda],
  template: `
    <main class="pagina">
      <header class="cabecalho"><h1>Vendas</h1></header>

      <div class="filtros">
        <select class="input" [ngModel]="vendedor()" (ngModelChange)="vendedor.set($event); recarregar()" aria-label="Vendedor">
          <option [ngValue]="null">Todos vendedores</option>
          @for (p of vendedores(); track p.id) {
            <option [ngValue]="p.id">{{ p.nome }}</option>
          }
        </select>
        <select class="input" [ngModel]="status()" (ngModelChange)="status.set($event); recarregar()" aria-label="Situação">
          <option [ngValue]="null">Todas</option>
          <option value="concluida">Concluídas</option>
          <option value="cancelada">Canceladas</option>
        </select>
      </div>

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
            <span class="muted small">
              {{ v.criada_em | dataHora }} · {{ v.vendedor?.nome }} · {{ v.tipo_preco === 'atacado' ? 'Atacado' : 'Varejo' }} · {{ pag[v.forma_pagamento] }}
              @if (v.offline) { · enviada offline }
            </span>
            <ul class="itens">
              @for (i of v.venda_itens; track $index) {
                <li><span class="num">{{ i.quantidade }}×</span> <span class="clamp-2">{{ i.variacoes.produtos.codigo || i.variacoes.codigo_barras }} {{ i.variacoes.produtos.nome }} · {{ i.variacoes.nome }}</span> <span class="muted num">{{ i.preco_unitario | brl }}</span></li>
              }
            </ul>
            @if (v.status === 'cancelada') {
              <p class="nota-cancelada">Cancelada: {{ v.motivo_cancelamento }}</p>
            }
            <div class="acoes-venda">
              <button type="button" class="btn sec pequeno" (click)="notinha.abrir(deLinha(v))"><i-con nome="imprimir" /> Reimprimir</button>
              @if (v.status !== 'cancelada') {
                <button type="button" class="btn sec pequeno" (click)="abrirCancelar(v)">Cancelar venda</button>
              }
            </div>
          </li>
        } @empty {
          @if (!carregando()) {
            <li class="vazio">Nenhuma venda encontrada.</li>
          }
        }
      </ul>
      @if (temMais()) {
        <button class="btn sec" (click)="carregar()" [disabled]="carregando()">Carregar mais</button>
      }
    </main>

    <dialog #dlg class="folha" aria-label="Cancelar venda">
      @if (sel(); as v) {
        <div class="topo-folha">
          <h2>Cancelar venda</h2>
          <button class="btn-icone" (click)="dlg.close()" aria-label="Fechar"><i-con nome="fechar" /></button>
        </div>
        <p>{{ v.cliente_nome }} · <strong class="num">{{ v.total | brl }}</strong> · {{ v.criada_em | dataHora }}</p>
        <div class="form">
          <label class="campo"><span>Motivo</span><input [ngModel]="motivo()" (ngModelChange)="motivo.set($event)" placeholder="Ex.: cliente desistiu" /></label>
          <div class="campo">
            <span class="rotulo-ajuda"><span id="devolver-rotulo">Os produtos voltam para o estoque?</span><app-ajuda sobre="Devolver ao estoque" texto="Sim se as peças voltaram inteiras para a loja; Não se ficaram com o cliente ou estão com defeito." /></span>
            <div class="segmento" role="group" aria-labelledby="devolver-rotulo">
              <button [attr.aria-pressed]="devolver() === true" (click)="devolver.set(true)">Sim, devolver</button>
              <button [attr.aria-pressed]="devolver() === false" (click)="devolver.set(false)">Não</button>
            </div>
          </div>
          <button class="btn perigo bloco" [disabled]="!motivo().trim() || devolver() === null || salvando()" (click)="cancelar()">Confirmar cancelamento</button>
        </div>
      }
    </dialog>
  `,
  styles: `
    .filtros { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: .5rem; }
    .venda { display: grid; gap: .3rem; padding: .85rem 1rem; }
    .venda.cancelada .topo .num { text-decoration: line-through; color: var(--muted); }
    .topo { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem; align-items: start; }
    .itens { margin: .2rem 0 0; padding: 0; list-style: none; font-size: .88rem; display: grid; gap: .2rem; }
    .itens li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .4rem; }
    .acoes-venda { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .25rem; }
    .topo-folha { display: flex; justify-content: space-between; align-items: center; margin-bottom: .5rem; }
    .form { display: grid; gap: 1rem; margin-top: 1rem; }
  `,
})
export class VendasAdmin {
  private toast = inject(Toast);
  private catalogo = inject(CatalogoService);
  protected notinha = inject(NotinhaService);
  protected deLinha = notinhaDeLinha;
  protected pag = PAGAMENTOS;
  protected lista = signal<VendaLinha[]>([]);
  protected vendedores = signal<{ id: string; nome: string }[]>([]);
  protected vendedor = signal<string | null>(null);
  protected status = signal<string | null>(null);
  protected carregando = signal(false);
  protected temMais = signal(false);
  protected erro = signal('');
  protected sel = signal<VendaLinha | null>(null);
  protected motivo = signal('');
  protected devolver = signal<boolean | null>(null);
  protected salvando = signal(false);
  private pagina = 0;
  /** Filtro trocado com a lista ainda carregando: a resposta do filtro antigo é ignorada. */
  private consulta = 0;
  private dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    supabase.from('perfis').select('id, nome').order('nome').then(({ data }) => this.vendedores.set(data ?? []));
    this.carregar();
  }

  protected recarregar() {
    this.pagina = 0;
    this.lista.set([]);
    this.carregar();
  }

  protected async carregar() {
    const vez = ++this.consulta;
    this.carregando.set(true);
    const passo = 30;
    let q = supabase.from('vendas').select(SELECT_VENDA).order('criada_em', { ascending: false });
    if (this.vendedor()) q = q.eq('vendedor_id', this.vendedor()!);
    if (this.status()) q = q.eq('status', this.status()!);
    const { data, error } = await q.range(this.pagina * passo, this.pagina * passo + passo - 1);
    if (vez !== this.consulta) return;
    this.carregando.set(false);
    if (error) return this.erro.set(mensagemErro(error));
    this.pagina++;
    this.lista.update((l) => [...l, ...(data as unknown as VendaLinha[])]);
    this.temMais.set(data.length === passo);
  }

  protected abrirCancelar(v: VendaLinha) {
    this.sel.set(v);
    this.motivo.set('');
    this.devolver.set(null);
    this.dlg().nativeElement.showModal();
  }

  protected async cancelar() {
    this.salvando.set(true);
    const { error } = await supabase.rpc('cancelar_venda', {
      p_venda: this.sel()!.id,
      p_motivo: this.motivo().trim(),
      p_devolver_estoque: this.devolver(),
    });
    this.salvando.set(false);
    if (error) return this.toast.mostrar(mensagemErro(error), 'erro');
    this.toast.mostrar(this.devolver() ? 'Venda cancelada e estoque devolvido' : 'Venda cancelada', 'ok');
    this.dlg().nativeElement.close();
    this.catalogo.atualizar();
    this.recarregar();
  }
}
