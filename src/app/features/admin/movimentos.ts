import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { supabase, mensagemErro } from '../../core/supabase';
import { DataHoraPipe, Ident, Icone, Toast, baixarCsv } from '../../shared/ui';
import { NOME_MOV } from './estoque';

interface MovLinha {
  id: number;
  tipo: string;
  quantidade: number;
  saldo_apos: number;
  custo_unitario: number | null;
  motivo: string | null;
  criado_em: string;
  perfis: { nome: string } | null;
  variacoes: { nome: string; codigo_barras: string | null; produtos: { codigo: string | null; nome: string } };
}

const SELECT = 'id, tipo, quantidade, saldo_apos, custo_unitario, motivo, criado_em, perfis(nome), variacoes(nome, codigo_barras, produtos(codigo, nome))';

@Component({
  selector: 'app-movimentos',
  imports: [FormsModule, DataHoraPipe, Ident, Icone],
  template: `
    <main class="pagina">
      <header class="cabecalho">
        <h1>Movimentações</h1>
        <button class="btn sec pequeno" (click)="exportar()"><i-con nome="baixar" /> <span class="rotulo-opcional">Excel</span></button>
      </header>
      <p class="muted small">Histórico completo e imutável: toda entrada, venda, ajuste e cancelamento.</p>

      <div class="rolagem-x" role="group" aria-label="Tipo de movimentação">
        <button class="chip" [attr.aria-pressed]="tipo() === null" (click)="filtrar(null)">Todas</button>
        @for (t of tiposMov; track t) {
          <button class="chip" [attr.aria-pressed]="tipo() === t" (click)="filtrar(t)">{{ nomes[t] }}</button>
        }
      </div>

      @if (erro()) {
        <p class="erro-msg">{{ erro() }}</p>
      }

      <ul class="lista">
        @for (m of lista(); track m.id) {
          <li class="mov">
            <app-ident [codigo]="m.variacoes.produtos.codigo" [barras]="m.variacoes.codigo_barras" />
            <div class="desc">
              <strong class="clamp-2">{{ m.variacoes.produtos.nome }}</strong>
              <span class="muted small uma-linha">{{ m.variacoes.nome }}</span>
            </div>
            <div class="qtd">
              <span class="num" [class.pos]="m.quantidade > 0" [class.neg]="m.quantidade < 0">{{ m.quantidade > 0 ? '+' : '' }}{{ m.quantidade }}</span>
              <span class="muted small num">saldo {{ m.saldo_apos }}</span>
            </div>
            <p class="meta small"><span class="tipo" [attr.data-tipo]="m.tipo">{{ nomes[m.tipo] }}</span> <span class="muted">{{ m.criado_em | dataHora }} · {{ m.perfis?.nome }}</span></p>
            @if (m.motivo) {
              <p class="motivo small">{{ m.motivo }}</p>
            }
          </li>
        } @empty {
          @if (!carregando()) {
            <li class="vazio">Nenhuma movimentação.</li>
          }
        }
      </ul>
      @if (temMais()) {
        <button class="btn sec" (click)="carregar()" [disabled]="carregando()">Carregar mais</button>
      }
    </main>
  `,
  styles: `
    .mov { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .35rem .65rem; padding: .8rem 1rem; align-items: start; }
    .mov app-ident { margin-top: .1rem; }
    .desc { display: grid; min-width: 0; line-height: 1.3; }
    .qtd { display: grid; justify-items: end; line-height: 1.2; }
    .qtd .num:first-child { font-weight: 800; font-size: 1.15rem; }
    .meta, .motivo { grid-column: 1 / -1; }
    .meta { display: flex; flex-wrap: wrap; column-gap: .4rem; }
    .tipo { font-weight: 700; }
    .motivo { padding: .4rem .6rem; background: var(--paper); border-radius: var(--r-sm); }
    .pos { color: var(--ok); }
    .neg { color: var(--danger); }
  `,
})
export class Movimentos {
  private toast = inject(Toast);
  protected nomes = NOME_MOV;
  protected tiposMov = ['entrada', 'venda', 'ajuste', 'cancelamento'];
  protected tipo = signal<string | null>(null);
  protected lista = signal<MovLinha[]>([]);
  protected carregando = signal(false);
  protected temMais = signal(false);
  protected erro = signal('');
  private pagina = 0;
  /** Filtro trocado com a lista ainda carregando: a resposta do filtro antigo é ignorada. */
  private consulta = 0;

  constructor() {
    this.carregar();
  }

  protected filtrar(t: string | null) {
    this.tipo.set(t);
    this.pagina = 0;
    this.lista.set([]);
    this.carregar();
  }

  protected async carregar() {
    const vez = ++this.consulta;
    this.carregando.set(true);
    const passo = 50;
    let q = supabase.from('movimentos').select(SELECT).order('criado_em', { ascending: false });
    if (this.tipo()) q = q.eq('tipo', this.tipo()!);
    const { data, error } = await q.range(this.pagina * passo, this.pagina * passo + passo - 1);
    if (vez !== this.consulta) return;
    this.carregando.set(false);
    if (error) return this.erro.set(mensagemErro(error));
    this.pagina++;
    this.lista.update((l) => [...l, ...(data as unknown as MovLinha[])]);
    this.temMais.set(data.length === passo);
  }

  protected async exportar() {
    const todos: MovLinha[] = [];
    for (let de = 0; ; de += 1000) {
      let q = supabase.from('movimentos').select(SELECT).order('criado_em');
      if (this.tipo()) q = q.eq('tipo', this.tipo()!);
      const { data, error } = await q.range(de, de + 999);
      if (error) return this.toast.mostrar(mensagemErro(error), 'erro');
      todos.push(...(data as unknown as MovLinha[]));
      if (data.length < 1000) break;
    }
    const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
    baixarCsv(`liang-movimentacoes-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Data', 'Tipo', 'Código', 'Produto', 'Variação', 'Quantidade', 'Saldo após', 'Custo un.', 'Usuário', 'Motivo'],
      ...todos.map((m) => [
        fmt.format(new Date(m.criado_em)), NOME_MOV[m.tipo], m.variacoes.produtos.codigo ?? m.variacoes.codigo_barras ?? '', m.variacoes.produtos.nome,
        m.variacoes.nome, m.quantidade, m.saldo_apos, m.custo_unitario === null ? '' : Number(m.custo_unitario),
        m.perfis?.nome ?? '', m.motivo ?? '',
      ]),
    ]);
  }
}
