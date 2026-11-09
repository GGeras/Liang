import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CatalogoService } from '../../core/catalogo.service';
import { supabase, mensagemErro } from '../../core/supabase';
import { ItemCatalogo } from '../../core/models';
import { BrlPipe, DataHoraPipe, Icone, Toast, baixarCsv } from '../../shared/ui';
import { Scanner } from '../../shared/scanner';

interface Mov {
  tipo: string;
  quantidade: number;
  saldo_apos: number;
  criado_em: string;
  motivo: string | null;
  perfis: { nome: string } | null;
}

export const NOME_MOV: Record<string, string> = {
  entrada: 'Entrada',
  venda: 'Venda',
  ajuste: 'Ajuste',
  cancelamento: 'Cancelamento',
};

@Component({
  selector: 'app-estoque',
  imports: [FormsModule, RouterLink, BrlPipe, DataHoraPipe, Icone, Scanner],
  template: `
    <main class="pagina">
      <header class="cabecalho">
        <h1>Estoque</h1>
        <div class="acoes-topo">
          <button class="btn-icone" (click)="scanner.abrir()" aria-label="Buscar por código de barras"><i-con nome="scan" /></button>
          <button class="btn-icone" (click)="exportar()" aria-label="Exportar estoque"><i-con nome="baixar" /></button>
          <a class="btn pequeno" routerLink="/admin/produtos/novo"><i-con nome="mais1" /> <span class="rotulo-opcional">Produto</span></a>
        </div>
      </header>

      <input class="input" type="search" placeholder="Buscar código, nome ou modelo" [ngModel]="termo()" (ngModelChange)="termo.set($event)" aria-label="Buscar" />

      <div class="rolagem-x" role="group" aria-label="Filtro">
        <button class="chip" [attr.aria-pressed]="!soBaixo()" (click)="soBaixo.set(false)">Todos · {{ catalogo.itens().length }}</button>
        <button class="chip" [attr.aria-pressed]="soBaixo()" (click)="soBaixo.set(true)">Abaixo do mínimo · {{ baixos() }}</button>
      </div>

      <ul class="lista">
        @for (i of lista(); track i.variacao_id) {
          <li>
            <button class="linha" (click)="abrir(i)">
              <span class="etiqueta">{{ i.codigo }}</span>
              <span class="nome"><strong class="clamp-2">{{ i.nome }}</strong><span class="muted small uma-linha">{{ i.variacao }}</span></span>
              <span class="qtd num" [class.baixo]="i.estoque <= i.estoque_minimo" [class.zero]="i.estoque <= 0">{{ i.estoque }}</span>
            </button>
          </li>
        } @empty {
          <li class="vazio">{{ catalogo.itens().length ? 'Nada encontrado.' : 'Cadastre o primeiro produto para começar.' }}</li>
        }
      </ul>
    </main>

    <dialog #dlg class="folha" aria-label="Movimentar estoque">
      @if (sel(); as i) {
        <div class="topo">
          <div>
            <span class="etiqueta">{{ i.codigo }}</span>
            <h2 class="clamp-2">{{ i.nome }}</h2>
            <p class="muted">{{ i.variacao }} · mínimo {{ i.estoque_minimo }}</p>
          </div>
          <button class="btn-icone" (click)="dlg.close()" aria-label="Fechar"><i-con nome="fechar" /></button>
        </div>

        <p class="saldo"><span class="num">{{ i.estoque }}</span> em estoque</p>

        <div class="segmento" role="group" aria-label="O que fazer">
          <button type="button" [attr.aria-pressed]="modo() === 'entrada'" (click)="modo.set('entrada')">Entrada</button>
          <button type="button" [attr.aria-pressed]="modo() === 'ajuste'" (click)="modo.set('ajuste')">Ajuste</button>
          <button type="button" [attr.aria-pressed]="modo() === 'historico'" (click)="modo.set('historico'); carregarMovs()">Histórico</button>
        </div>

        @switch (modo()) {
          @case ('entrada') {
            <div class="form">
              <label class="campo"><span>Quantidade que chegou</span><input type="number" min="1" inputmode="numeric" [ngModel]="qtd()" (ngModelChange)="qtd.set($event)" /></label>
              <label class="campo"><span>Custo por unidade (opcional)</span><input type="number" min="0" step="0.01" inputmode="decimal" [ngModel]="custo()" (ngModelChange)="custo.set($event)" /></label>
              <label class="campo"><span>Observação (opcional)</span><input [ngModel]="obs()" (ngModelChange)="obs.set($event)" /></label>
              <button class="btn ok bloco" [disabled]="!(qtd() > 0) || salvando()" (click)="entrada()">Registrar entrada ({{ qtd() || 0 }})</button>
            </div>
          }
          @case ('ajuste') {
            <div class="form">
              <p class="muted small">Use para corrigir contagem, perda ou defeito. Fica registrado no histórico com o motivo.</p>
              <label class="campo"><span>Quantidade correta</span><input type="number" min="0" inputmode="numeric" [ngModel]="qtd()" (ngModelChange)="qtd.set($event)" /></label>
              <label class="campo"><span>Motivo</span><input [ngModel]="obs()" (ngModelChange)="obs.set($event)" placeholder="Ex.: contagem de inventário" /></label>
              <button class="btn bloco" [disabled]="qtd() === null || qtd() < 0 || !obs().trim() || salvando()" (click)="ajuste()">Ajustar estoque para {{ qtd() }}</button>
            </div>
          }
          @case ('historico') {
            <ul class="movs">
              @for (m of movs(); track $index) {
                <li>
                  <span class="num" [class.pos]="m.quantidade > 0" [class.neg]="m.quantidade < 0">{{ m.quantidade > 0 ? '+' : '' }}{{ m.quantidade }}</span>
                  <span>{{ nomeMov[m.tipo] }} · {{ m.perfis?.nome }}<br /><span class="muted small">{{ m.criado_em | dataHora }}{{ m.motivo ? ' · ' + m.motivo : '' }}</span></span>
                  <span class="muted num small">saldo {{ m.saldo_apos }}</span>
                </li>
              } @empty {
                <li class="muted small">Sem movimentações.</li>
              }
            </ul>
          }
        }
        <a class="btn sec bloco editar" [routerLink]="['/admin/produtos', i.produto_id]" (click)="dlg.close()"><i-con nome="editar" /> Editar produto e preços</a>
        <p class="muted small precos">Atacado {{ i.preco_atacado | brl }} · Varejo {{ i.preco_varejo | brl }}</p>
      }
    </dialog>

    <app-scanner #scanner (lido)="porBarras($event)" />
  `,
  styles: `
    .acoes-topo { display: flex; align-items: center; gap: .25rem; }
    .linha { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .75rem; align-items: start; padding: .8rem 1rem; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
    .nome { display: grid; min-width: 0; }
    .linha .etiqueta { margin-top: .1rem; }
    .qtd { font-size: 1.3rem; line-height: 1.2; font-weight: 800; font-stretch: 112%; min-width: 2.5rem; text-align: right; }
    .qtd.baixo { color: var(--warn); }
    .qtd.zero { color: var(--danger); }
    .topo { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 1rem; }
    .topo h2 { margin-top: .4rem; }
    .saldo { margin: 1rem 0; font-weight: 650; }
    .saldo .num { font-size: 2.2rem; font-weight: 800; font-stretch: 118%; margin-right: .3rem; }
    .form { display: grid; gap: .9rem; margin-top: 1rem; }
    .movs { list-style: none; padding: 0; margin: 1rem 0 0; display: grid; gap: .7rem; max-height: 40vh; overflow-y: auto; }
    .movs li { display: grid; grid-template-columns: 3.2rem minmax(0, 1fr) auto; gap: .5rem; align-items: start; }
    .movs .num { font-weight: 800; }
    .pos { color: var(--ok); }
    .neg { color: var(--danger); }
    .editar { margin-top: 1.25rem; }
    .precos { text-align: center; margin-top: .5rem; }
  `,
})
export class Estoque {
  protected catalogo = inject(CatalogoService);
  private toast = inject(Toast);
  protected nomeMov = NOME_MOV;
  protected termo = signal('');
  protected soBaixo = signal(false);
  protected sel = signal<ItemCatalogo | null>(null);
  protected modo = signal<'entrada' | 'ajuste' | 'historico'>('entrada');
  protected qtd = signal<number>(1);
  protected custo = signal<number | null>(null);
  protected obs = signal('');
  protected salvando = signal(false);
  protected movs = signal<Mov[]>([]);
  private dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected baixos = computed(() => this.catalogo.itens().filter((i) => i.estoque <= i.estoque_minimo).length);
  protected lista = computed(() => {
    const l = this.catalogo.pesquisar(this.termo());
    return this.soBaixo() ? l.filter((i) => i.estoque <= i.estoque_minimo) : l;
  });

  constructor() {
    this.catalogo.atualizar();
  }

  protected abrir(i: ItemCatalogo) {
    this.sel.set(i);
    this.modo.set('entrada');
    this.qtd.set(1);
    this.custo.set(null);
    this.obs.set('');
    this.dlg().nativeElement.showModal();
  }

  protected porBarras(c: string) {
    const i = this.catalogo.buscarBarras(c);
    if (i) this.abrir(i);
    else this.toast.mostrar('Código de barras não cadastrado. Cadastre-o na variação do produto.', 'erro');
  }

  protected async entrada() {
    await this.executar(() =>
      supabase.rpc('registrar_entrada', {
        p_variacao: this.sel()!.variacao_id,
        p_quantidade: Number(this.qtd()),
        p_custo: this.custo() === null || (this.custo() as unknown) === '' ? null : Number(this.custo()),
        p_obs: this.obs().trim() || null,
      }),
      `Entrada de ${this.qtd()} registrada`,
    );
  }

  protected async ajuste() {
    await this.executar(
      () => supabase.rpc('ajustar_estoque', { p_variacao: this.sel()!.variacao_id, p_nova_quantidade: Number(this.qtd()), p_motivo: this.obs().trim() }),
      `Estoque ajustado para ${this.qtd()}`,
    );
  }

  private async executar(fn: () => PromiseLike<{ error: unknown }>, ok: string) {
    this.salvando.set(true);
    const { error } = await fn();
    this.salvando.set(false);
    if (error) return this.toast.mostrar(mensagemErro(error), 'erro');
    this.toast.mostrar(ok, 'ok');
    await this.catalogo.atualizar();
    const novo = this.catalogo.itens().find((x) => x.variacao_id === this.sel()?.variacao_id);
    if (novo) this.sel.set(novo);
    this.qtd.set(this.modo() === 'ajuste' ? (novo?.estoque ?? 0) : 1);
    this.obs.set('');
    this.custo.set(null);
  }

  protected async carregarMovs() {
    const { data } = await supabase
      .from('movimentos')
      .select('tipo, quantidade, saldo_apos, criado_em, motivo, perfis(nome)')
      .eq('variacao_id', this.sel()!.variacao_id)
      .order('criado_em', { ascending: false })
      .limit(50);
    this.movs.set((data ?? []) as unknown as Mov[]);
  }

  protected exportar() {
    baixarCsv(`liang-estoque-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Código', 'Tipo', 'Produto', 'Marca', 'Modelo', 'Variação', 'Estoque', 'Mínimo', 'Atacado', 'Varejo', 'Código de barras'],
      ...this.catalogo.itens().map((i) => [
        i.codigo, i.tipo, i.nome, i.marca, i.modelo, i.variacao, i.estoque, i.estoque_minimo,
        Number(i.preco_atacado), Number(i.preco_varejo), i.codigo_barras,
      ]),
    ]);
  }
}
