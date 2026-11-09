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

      <div class="rolagem-x" role="group" aria-label="Filtrar por tipo">
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
                <strong class="clamp-2">{{ g.nome }}</strong>
              </div>
              <ul class="vars">
                @for (v of g.variacoes; track v.variacao_id) {
                  <li [class.zerado]="v.estoque <= 0">
                    <span class="var-nome">{{ v.variacao }}</span>
                    <span class="est num" [class.baixo]="v.estoque > 0 && v.estoque <= v.estoque_minimo">
                      {{ v.estoque <= 0 ? 'Sem estoque' : v.estoque + ' em estoque' }}
                    </span>
                    <span class="preco"><span class="rot">Atacado</span><span class="num">{{ v.preco_atacado | brl }}</span></span>
                    <span class="preco"><span class="rot">Varejo</span><span class="num">{{ v.preco_varejo | brl }}</span></span>
                  </li>
                }
              </ul>
            </button>
          </li>
        }
      </ul>
    </main>

    <dialog #dlg class="folha" aria-label="Detalhes do produto">
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
    .produto { width: 100%; display: grid; gap: .6rem; padding: .9rem 1rem; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
    .linha1 { display: grid; grid-template-columns: auto 1fr; gap: .6rem; align-items: start; }
    .linha1 .etiqueta { margin-top: .1rem; }
    .vars { list-style: none; margin: 0; padding: 0; display: grid; gap: .4rem; }
    .vars li {
      display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .15rem .75rem;
      padding: .55rem .7rem; border-radius: var(--r-sm); background: var(--paper);
    }
    .var-nome { font-weight: 650; font-size: .92rem; min-width: 0; }
    .est { justify-self: end; align-self: start; font-size: .78rem; font-weight: 650; color: var(--muted); }
    .est.baixo { color: var(--warn); }
    /* rótulo acima do valor: cabe R$ 9.999,99 nas duas colunas em 360px */
    .preco { display: grid; font-size: .98rem; font-weight: 700; line-height: 1.25; margin-top: .2rem; }
    .vars li .preco:last-child { justify-items: end; }
    .preco .rot { font-size: .75rem; font-weight: 600; color: var(--muted); }
    /* Sem estoque: fundo vazado e texto cinza (sem opacity, para manter o contraste AA) */
    .vars li.zerado { background: none; box-shadow: inset 0 0 0 1.5px var(--line); color: var(--muted); }
    .vars li.zerado .est { color: var(--danger); }
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
