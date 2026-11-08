import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { supabase, mensagemErro } from '../../core/supabase';
import { DataHoraPipe, Icone, Toast, baixarCsv } from '../../shared/ui';
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
  variacoes: { nome: string; produtos: { codigo: string; nome: string } };
}

const SELECT = 'id, tipo, quantidade, saldo_apos, custo_unitario, motivo, criado_em, perfis(nome), variacoes(nome, produtos(codigo, nome))';

@Component({
  selector: 'app-movimentos',
  imports: [FormsModule, DataHoraPipe, Icone],
  template: `
    <main class="pagina">
      <header class="cabecalho">
        <h1>Movimentações</h1>
        <button class="btn sec pequeno" (click)="exportar()"><i-con nome="baixar" /> Excel</button>
      </header>
      <p class="muted small">Histórico completo e imutável: toda entrada, venda, ajuste e cancelamento.</p>

      <div class="tipos" role="group" aria-label="Tipo de movimentação">
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
            <span class="qtd num" [class.pos]="m.quantidade > 0" [class.neg]="m.quantidade < 0">{{ m.quantidade > 0 ? '+' : '' }}{{ m.quantidade }}</span>
            <div>
              <span class="etiqueta">{{ m.variacoes.produtos.codigo }}</span>
              <strong> {{ m.variacoes.produtos.nome }}</strong> <span class="muted small">· {{ m.variacoes.nome }}</span>
              <p class="muted small">{{ nomes[m.tipo] }} · {{ m.perfis?.nome }} · {{ m.criado_em | dataHora }}</p>
              @if (m.motivo) {
                <p class="small">{{ m.motivo }}</p>
              }
            </div>
            <span class="muted small num">saldo {{ m.saldo_apos }}</span>
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
    .tipos { display: flex; gap: .4rem; overflow-x: auto; scrollbar-width: none; }
    .chip { flex: none; min-height: 36px; padding: 0 .9rem; border-radius: 99px; border: 1.5px solid var(--line); background: var(--surface); font: inherit; font-weight: 650; font-size: .88rem; color: var(--muted); cursor: pointer; }
    .chip[aria-pressed='true'] { background: var(--ink); border-color: var(--ink); color: #fff; }
    .mov { display: grid; grid-template-columns: 3rem 1fr auto; gap: .6rem; padding: .8rem 1rem; align-items: start; }
    .qtd { font-weight: 800; font-size: 1.15rem; }
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
    this.carregando.set(true);
    const passo = 50;
    let q = supabase.from('movimentos').select(SELECT).order('criado_em', { ascending: false });
    if (this.tipo()) q = q.eq('tipo', this.tipo()!);
    const { data, error } = await q.range(this.pagina * passo, this.pagina * passo + passo - 1);
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
        fmt.format(new Date(m.criado_em)), NOME_MOV[m.tipo], m.variacoes.produtos.codigo, m.variacoes.produtos.nome,
        m.variacoes.nome, m.quantidade, m.saldo_apos, m.custo_unitario === null ? '' : Number(m.custo_unitario),
        m.perfis?.nome ?? '', m.motivo ?? '',
      ]),
    ]);
  }
}
