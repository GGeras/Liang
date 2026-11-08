import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CatalogoService } from '../../core/catalogo.service';
import { AuthService } from '../../core/auth.service';
import { ItemCatalogo } from '../../core/models';
import { BrlPipe, DataHoraPipe, Icone } from '../../shared/ui';

interface Grupo {
  produto_id: string;
  codigo: string;
  nome: string;
  marca: string | null;
  modelo: string | null;
  tipo: string;
  foto_url: string | null;
  descricao: string | null;
  compativeis: string[];
  variacoes: ItemCatalogo[];
}

@Component({
  selector: 'app-catalogo',
  imports: [FormsModule, RouterLink, BrlPipe, DataHoraPipe, Icone],
  template: `
    <main class="pagina">
      <header class="cabecalho">
        <h1>Catálogo</h1>
        <span class="muted small">{{ grupos().length }} produtos</span>
      </header>

      <input class="input busca" type="search" placeholder="Buscar por código, nome, marca ou modelo"
        [ngModel]="termo()" (ngModelChange)="termo.set($event)" aria-label="Buscar no catálogo" />

      <div class="tipos" role="group" aria-label="Filtrar por tipo">
        <button class="chip" [attr.aria-pressed]="tipo() === null" (click)="tipo.set(null)">Todos</button>
        @for (t of tipos(); track t.id) {
          <button class="chip" [attr.aria-pressed]="tipo() === t.id" (click)="tipo.set(t.id)">{{ t.nome }}</button>
        }
      </div>

      @if (catalogo.atualizadoEm()) {
        <p class="muted small">Preços e estoque de {{ catalogo.atualizadoEm() | dataHora }}</p>
      }

      @if (grupos().length === 0) {
        <p class="vazio">{{ catalogo.itens().length ? 'Nada encontrado com essa busca.' : 'O catálogo ainda está vazio.' }}</p>
      }

      <ul class="lista">
        @for (g of grupos(); track g.produto_id) {
          <li>
            <button class="produto" (click)="abrir(g)">
              <div class="linha1">
                <span class="etiqueta">{{ g.codigo }}</span>
                <span class="muted small">{{ g.tipo }}</span>
              </div>
              <strong>{{ g.nome }}</strong>
              <table class="precos">
                <thead><tr><th>Variação</th><th>Atacado</th><th>Varejo</th><th>Est.</th></tr></thead>
                <tbody>
                  @for (v of g.variacoes; track v.variacao_id) {
                    <tr [class.zerado]="v.estoque <= 0">
                      <td>{{ v.variacao }}</td>
                      <td class="num">{{ v.preco_atacado | brl }}</td>
                      <td class="num">{{ v.preco_varejo | brl }}</td>
                      <td class="num" [class.baixo]="v.estoque <= v.estoque_minimo">{{ v.estoque }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </button>
          </li>
        }
      </ul>
    </main>

    <dialog #dlg class="folha">
      @if (sel(); as g) {
        <div class="topo">
          <span class="etiqueta">{{ g.codigo }}</span>
          <button class="btn-icone" (click)="dlg.close()" aria-label="Fechar"><i-con nome="fechar" /></button>
        </div>
        @if (g.foto_url) {
          <img [src]="g.foto_url" [alt]="g.nome" class="foto" />
        }
        <h2>{{ g.nome }}</h2>
        <p class="muted">{{ subtitulo(g) }}</p>
        @if (g.descricao) {
          <p class="desc">{{ g.descricao }}</p>
        }
        <h3>Compatível com</h3>
        @if (g.compativeis.length) {
          <ul class="compat">
            @for (m of g.compativeis; track m) {
              <li>{{ m }}</li>
            }
          </ul>
        } @else {
          <p class="muted small">Nenhuma compatibilidade confirmada.</p>
        }
        @if (auth.isAdmin()) {
          <a class="btn sec bloco" [routerLink]="['/admin/produtos', g.produto_id]" (click)="dlg.close()"><i-con nome="editar" /> Editar produto</a>
        }
      }
    </dialog>
  `,
  styles: `
    .busca { position: sticky; top: .5rem; z-index: 5; }
    .tipos { display: flex; gap: .4rem; overflow-x: auto; padding-bottom: .25rem; scrollbar-width: none; }
    .chip { flex: none; min-height: 36px; padding: 0 .9rem; border-radius: 99px; border: 1.5px solid var(--line); background: var(--surface); font: inherit; font-weight: 650; font-size: .88rem; color: var(--muted); cursor: pointer; }
    .chip[aria-pressed='true'] { background: var(--ink); border-color: var(--ink); color: #fff; }
    .produto { width: 100%; display: grid; gap: .35rem; padding: .9rem 1rem; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
    .linha1 { display: flex; justify-content: space-between; align-items: center; }
    .precos { width: 100%; border-collapse: collapse; font-size: .88rem; margin-top: .25rem; }
    .precos th { text-align: right; font-weight: 600; color: var(--muted); font-size: .75rem; padding-bottom: .15rem; }
    .precos th:first-child, .precos td:first-child { text-align: left; }
    .precos td { text-align: right; padding: .2rem 0 .2rem .5rem; }
    .precos tr.zerado td { color: var(--muted); text-decoration: line-through; }
    .precos td.baixo { color: var(--danger); font-weight: 750; text-decoration: none; }
    .topo { display: flex; justify-content: space-between; align-items: center; margin-bottom: .5rem; }
    .foto { width: 100%; max-height: 240px; object-fit: contain; background: var(--paper); border-radius: var(--r-md); margin-bottom: .75rem; }
    .desc { margin: .5rem 0 1rem; white-space: pre-line; }
    h3 { margin: 1rem 0 .4rem; }
    .compat { margin: 0 0 1rem; padding-left: 1.1rem; }
  `,
})
export class Catalogo {
  protected catalogo = inject(CatalogoService);
  protected auth = inject(AuthService);
  protected termo = signal('');
  protected tipo = signal<number | null>(null);
  protected sel = signal<Grupo | null>(null);
  private dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected tipos = computed(() => {
    const m = new Map<number, string>();
    for (const i of this.catalogo.itens()) m.set(i.tipo_id, i.tipo);
    return [...m].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.id - b.id);
  });

  protected grupos = computed<Grupo[]>(() => {
    const t = this.tipo();
    const m = new Map<string, Grupo>();
    for (const i of this.catalogo.pesquisar(this.termo())) {
      if (t !== null && i.tipo_id !== t) continue;
      const g = m.get(i.produto_id) ?? { ...i, variacoes: [] as ItemCatalogo[] };
      g.variacoes.push(i);
      m.set(i.produto_id, g);
    }
    return [...m.values()];
  });

  protected subtitulo(g: Grupo) {
    return [g.marca, g.modelo].filter(Boolean).join(' · ');
  }

  protected abrir(g: Grupo) {
    this.sel.set(g);
    this.dlg().nativeElement.showModal();
  }
}
