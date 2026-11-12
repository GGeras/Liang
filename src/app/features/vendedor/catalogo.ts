import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CatalogoService } from '../../core/catalogo.service';
import { AuthService } from '../../core/auth.service';
import { ItemCatalogo } from '../../core/models';
import { BrlPipe, DataHoraPipe, Ident, Icone } from '../../shared/ui';

interface Grupo {
  produto_id: string;
  codigo: string | null;
  nome: string;
  marca: string | null;
  modelo: string | null;
  tipo_id: number;
  tipo: string;
  foto_url: string | null;
  descricao: string | null;
  compativeis: string[];
  variacoes: ItemCatalogo[];
}

interface TipoCatalogo {
  id: number;
  nome: string;
  produtos: number;
}

@Component({
  selector: 'app-catalogo',
  imports: [FormsModule, RouterLink, BrlPipe, DataHoraPipe, Ident, Icone],
  template: `
    <main class="pagina">
      @if (tipoId() === null) {
        <header class="cabecalho">
          <h1>Catálogo</h1>
          <span class="muted small">{{ contagem(totalProdutos()) }}</span>
        </header>
      } @else {
        <header class="cabecalho">
          <button type="button" class="btn-icone" (click)="voltar()" aria-label="Voltar para os tipos"><i-con nome="voltar" /></button>
          <h1 class="titulo-tipo"><span class="etiqueta num">{{ pad(tipoId()!) }}</span><span class="clamp-2">{{ tipoAtual()?.nome ?? 'Tipo' }}</span></h1>
          <span class="muted small">{{ contagem(tipoAtual()?.produtos ?? 0) }}</span>
        </header>
      }

      <input class="input busca" type="search" [placeholder]="tipoAtual() ? 'Buscar em ' + tipoAtual()!.nome : 'Buscar por código, nome, marca ou modelo'"
        [ngModel]="termo()" (ngModelChange)="termo.set($event)" aria-label="Buscar no catálogo" />

      @if (catalogo.atualizadoEm()) {
        <p class="muted small">Preços e estoque de {{ catalogo.atualizadoEm() | dataHora }}</p>
      }

      @if (tipoId() === null && !termo().trim()) {
        <!-- Primeiro o tipo; os produtos aparecem depois de escolher -->
        @if (tipos().length) {
          <ul class="lista" aria-label="Tipos de produto">
            @for (t of tipos(); track t.id) {
              <li>
                <button type="button" class="tipo-linha" (click)="abrirTipo(t.id)">
                  <span class="etiqueta num">{{ pad(t.id) }}</span>
                  <span class="tipo-nome">
                    <strong class="clamp-2">{{ t.nome }}</strong>
                    <span class="muted small">{{ contagem(t.produtos) }}</span>
                  </span>
                  <i-con nome="voltar" class="seta" />
                </button>
              </li>
            }
          </ul>
        } @else {
          <p class="vazio">O catálogo ainda está vazio.</p>
        }
      } @else {
        @if (secoes().length === 0) {
          <p class="vazio">{{ catalogo.itens().length ? 'Nada encontrado com essa busca.' : 'O catálogo ainda está vazio.' }}</p>
        }
        @for (s of secoes(); track s.id) {
          <section class="secao">
            @if (tipoId() === null) {
              <h2 class="secao-titulo"><span class="etiqueta num">{{ pad(s.id) }}</span><span class="uma-linha">{{ s.nome }}</span><span class="muted small num conta">{{ contagem(s.grupos.length) }}</span></h2>
            }
            <ul class="lista">
        @for (g of s.grupos; track g.produto_id) {
          <li>
            <button class="produto" (click)="abrir(g)">
              <div class="linha1">
                @if (g.codigo) {
                  <span class="etiqueta">{{ g.codigo }}</span>
                }
                <strong class="clamp-2">{{ g.nome }}</strong>
              </div>
              <ul class="vars">
                @for (v of g.variacoes; track v.variacao_id) {
                  <li [class.zerado]="v.estoque <= 0">
                    <span class="var-nome">{{ v.variacao }}@if (v.codigo_barras) {<span class="barras-var num">{{ v.codigo_barras }}</span>}</span>
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
          </section>
        }
      }
    </main>

    <dialog #dlg class="folha" aria-label="Detalhes do produto">
      @if (sel(); as g) {
        <div class="topo">
          <app-ident [codigo]="g.codigo" [barras]="g.variacoes.length === 1 ? g.variacoes[0].codigo_barras : null" />
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
    .titulo-tipo { flex: 1; min-width: 0; display: flex; align-items: center; gap: .5rem; font-size: 1.3rem; }
    .titulo-tipo .etiqueta { flex: none; font-size: 1rem; }
    .tipo-linha {
      width: 100%; min-height: 64px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .75rem; align-items: center;
      padding: .8rem 1rem; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer;
    }
    .tipo-linha .etiqueta { font-size: 1rem; }
    .tipo-nome { display: grid; gap: .1rem; min-width: 0; font-size: 1.05rem; }
    .seta { transform: rotate(180deg); color: var(--muted); }
    .secao { display: grid; gap: .5rem; }
    .secao-titulo { display: flex; align-items: center; gap: .5rem; margin: 0; min-width: 0; font-size: 1.05rem; }
    .secao-titulo .conta { margin-left: auto; flex: none; font-weight: 600; }
    .produto { width: 100%; display: grid; gap: .6rem; padding: .9rem 1rem; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
    .linha1 { display: flex; gap: .6rem; align-items: start; }
    .linha1 strong { flex: 1; min-width: 0; }
    .linha1 .etiqueta { margin-top: .1rem; }
    .vars { list-style: none; margin: 0; padding: 0; display: grid; gap: .4rem; }
    .vars li {
      display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .15rem .75rem;
      padding: .55rem .7rem; border-radius: var(--r-sm); background: var(--paper);
    }
    .var-nome { font-weight: 650; font-size: .92rem; min-width: 0; }
    .barras-var { display: block; font-size: .75rem; font-weight: 600; color: var(--muted); }
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
  private router = inject(Router);
  /** Tipo escolhido, na URL (?tipo=1): o voltar do celular retorna para a lista de tipos. */
  readonly tipoParam = input<string | undefined>(undefined, { alias: 'tipo' });
  protected termo = signal('');
  protected sel = signal<Grupo | null>(null);
  private dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  /** Entrou no tipo tocando na lista: o Voltar só desfaz essa navegação. */
  private veioDaLista = false;

  protected tipoId = computed(() => {
    const n = Number(this.tipoParam());
    return this.tipoParam() && Number.isInteger(n) ? n : null;
  });

  protected tipos = computed<TipoCatalogo[]>(() => {
    const m = new Map<number, { nome: string; produtos: Set<string> }>();
    for (const i of this.catalogo.itens()) {
      const t = m.get(i.tipo_id) ?? { nome: i.tipo, produtos: new Set<string>() };
      t.produtos.add(i.produto_id);
      m.set(i.tipo_id, t);
    }
    return [...m].map(([id, t]) => ({ id, nome: t.nome, produtos: t.produtos.size })).sort((a, b) => a.id - b.id);
  });

  protected tipoAtual = computed(() => this.tipos().find((t) => t.id === this.tipoId()));
  protected totalProdutos = computed(() => this.tipos().reduce((s, t) => s + t.produtos, 0));

  /** Produtos (com as variações) do tipo escolhido, ou de todos os tipos ao buscar, separados por tipo. */
  protected secoes = computed(() => {
    const t = this.tipoId();
    const m = new Map<string, Grupo>();
    for (const i of this.catalogo.pesquisar(this.termo())) {
      if (t !== null && i.tipo_id !== t) continue;
      const g = m.get(i.produto_id) ?? { ...i, variacoes: [] as ItemCatalogo[] };
      g.variacoes.push(i);
      m.set(i.produto_id, g);
    }
    const grupos = [...m.values()];
    return this.tipos()
      .map((tipo) => ({ ...tipo, grupos: grupos.filter((g) => g.tipo_id === tipo.id) }))
      .filter((s) => s.grupos.length);
  });

  constructor() {
    // Trocou de tipo (ou voltou para a lista): busca limpa e começa do topo
    let anterior: number | null | undefined;
    effect(() => {
      const id = this.tipoId();
      untracked(() => {
        if (anterior !== undefined && anterior !== id) {
          this.termo.set('');
          scrollTo({ top: 0 });
        }
        anterior = id;
      });
    });
  }

  protected pad(n: number) {
    return String(n).padStart(2, '0');
  }

  protected contagem(n: number) {
    return n === 1 ? '1 produto' : `${n} produtos`;
  }

  protected abrirTipo(id: number) {
    this.veioDaLista = true;
    this.router.navigate([], { queryParams: { tipo: id } });
  }

  protected voltar() {
    if (this.veioDaLista) history.back();
    else this.router.navigate([], { queryParams: {}, replaceUrl: true });
    this.veioDaLista = false;
  }

  protected subtitulo(g: Grupo) {
    return [g.marca, g.modelo].filter(Boolean).join(' · ');
  }

  protected abrir(g: Grupo) {
    this.sel.set(g);
    this.dlg().nativeElement.showModal();
  }
}
