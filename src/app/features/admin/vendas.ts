import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { supabase, mensagemErro } from '../../core/supabase';
import { CatalogoService } from '../../core/catalogo.service';
import { PAGAMENTOS } from '../../core/models';
import { BrlPipe, DataHoraPipe, Icone, Toast } from '../../shared/ui';
import { SELECT_VENDA, VendaLinha } from '../vendedor/minhas-vendas';

@Component({
  selector: 'app-vendas-admin',
  imports: [FormsModule, BrlPipe, DataHoraPipe, Icone],
  template: `
    <main class="pagina">
      <header class="cabecalho"><h1>Vendas</h1></header>

      <div class="filtros">
        <select class="input" [ngModel]="vendedor()" (ngModelChange)="vendedor.set($event); recarregar()" aria-label="Vendedor">
          <option [ngValue]="null">Todos os vendedores</option>
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
              <strong>{{ v.cliente_nome }}</strong>
              <strong class="num">{{ v.total | brl }}</strong>
            </div>
            <span class="muted small">
              {{ v.criada_em | dataHora }} · {{ v.vendedor?.nome }} · {{ v.tipo_preco === 'atacado' ? 'Atacado' : 'Varejo' }} · {{ pag[v.forma_pagamento] }}
              @if (v.offline) { · enviada offline }
            </span>
            <ul class="itens">
              @for (i of v.venda_itens; track $index) {
                <li><span class="num">{{ i.quantidade }}×</span> {{ i.variacoes.produtos.codigo }} {{ i.variacoes.produtos.nome }} · {{ i.variacoes.nome }} <span class="muted num">{{ i.preco_unitario | brl }}</span></li>
              }
            </ul>
            @if (v.status === 'cancelada') {
              <span class="selo perigo">Cancelada: {{ v.motivo_cancelamento }}</span>
            } @else {
              <button class="btn sec pequeno cancelar" (click)="abrirCancelar(v)">Cancelar venda</button>
            }
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

    <dialog #dlg class="folha">
      @if (sel(); as v) {
        <div class="topo-folha">
          <h2>Cancelar venda</h2>
          <button class="btn-icone" (click)="dlg.close()" aria-label="Fechar"><i-con nome="fechar" /></button>
        </div>
        <p>{{ v.cliente_nome }} · <strong class="num">{{ v.total | brl }}</strong> · {{ v.criada_em | dataHora }}</p>
        <div class="form">
          <label class="campo"><span>Motivo</span><input [ngModel]="motivo()" (ngModelChange)="motivo.set($event)" placeholder="Ex.: cliente desistiu" /></label>
          <div class="campo">
            <span>Os produtos voltam para o estoque?</span>
            <div class="segmento">
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
    .filtros { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
    .venda { display: grid; gap: .3rem; padding: .85rem 1rem; }
    .venda.cancelada { opacity: .7; }
    .topo { display: flex; justify-content: space-between; gap: 1rem; }
    .itens { margin: .2rem 0 0; padding: 0; list-style: none; font-size: .88rem; }
    .selo, .cancelar { justify-self: start; }
    .topo-folha { display: flex; justify-content: space-between; align-items: center; margin-bottom: .5rem; }
    .form { display: grid; gap: 1rem; margin-top: 1rem; }
  `,
})
export class VendasAdmin {
  private toast = inject(Toast);
  private catalogo = inject(CatalogoService);
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
    this.carregando.set(true);
    const passo = 30;
    let q = supabase.from('vendas').select(SELECT_VENDA).order('criada_em', { ascending: false });
    if (this.vendedor()) q = q.eq('vendedor_id', this.vendedor()!);
    if (this.status()) q = q.eq('status', this.status()!);
    const { data, error } = await q.range(this.pagina * passo, this.pagina * passo + passo - 1);
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
