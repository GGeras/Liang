import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { supabase, mensagemErro } from '../../core/supabase';
import { Icone, Toast } from '../../shared/ui';
import { Scanner } from '../../shared/scanner';

export interface Tipo {
  id: number;
  nome: string;
}

interface ProdutoLinha {
  id: string;
  codigo: string;
  tipo_id: number;
  nome: string;
  marca: string | null;
  modelo: string | null;
  ativo: boolean;
  variacoes: { nome: string; ativo: boolean; codigo_barras: string | null }[];
  compatibilidades: { status: string }[];
}

@Component({
  selector: 'app-produtos',
  imports: [FormsModule, RouterLink, Icone, Scanner],
  template: `
    <main class="pagina">
      <header class="cabecalho">
        <h1>Produtos</h1>
        <div class="acoes">
          <button class="btn-icone" (click)="scanner.abrir()" aria-label="Cadastrar ou abrir produto pelo código de barras"><i-con nome="scan" /></button>
          <button class="btn sec pequeno" (click)="abrirTipos()">Tipos</button>
          <a class="btn pequeno" routerLink="/admin/produtos/novo"><i-con nome="mais1" /> Novo</a>
        </div>
      </header>
      <app-scanner #scanner (lido)="porBarras($event)" />

      <input class="input" type="search" placeholder="Buscar" [ngModel]="termo()" (ngModelChange)="termo.set($event)" aria-label="Buscar produtos" />

      @if (erro()) {
        <p class="erro-msg">{{ erro() }}</p>
      }

      @for (g of grupos(); track g.tipo.id) {
        <section>
          <h2 class="grupo"><span class="etiqueta">{{ pad(g.tipo.id) }}</span> <span class="uma-linha">{{ g.tipo.nome }}</span> <span class="muted small num conta">{{ g.itens.length }} de 100</span></h2>
          <ul class="lista">
            @for (p of g.itens; track p.id) {
              <li>
                <a class="linha" [routerLink]="['/admin/produtos', p.id]" [class.inativo]="!p.ativo">
                  <span class="etiqueta">{{ p.codigo }}</span>
                  <span class="nome">
                    <strong class="clamp-2">{{ p.nome }}</strong>
                    <span class="muted small uma-linha">{{ resumoVar(p) }}</span>
                    @if (aConfirmar(p) || !p.ativo) {
                      <span class="selos">
                        @if (aConfirmar(p)) {
                          <span class="selo alerta">{{ aConfirmar(p) }} compatib. a confirmar</span>
                        }
                        @if (!p.ativo) {
                          <span class="selo">Inativo</span>
                        }
                      </span>
                    }
                  </span>
                </a>
              </li>
            }
          </ul>
          @if (!g.itens.length) {
            <p class="muted small sem-itens">Nenhum produto cadastrado.</p>
          }
        </section>
      } @empty {
        @if (!carregando()) {
          <p class="vazio">Comece cadastrando os tipos (ex.: 01 Telas, 02 Tampas) e depois os produtos.</p>
        }
      }
    </main>

    <dialog #dlgTipos class="folha" aria-labelledby="tipos-titulo">
      <div class="topo">
        <h2 id="tipos-titulo">Tipos de produto</h2>
        <button class="btn-icone" (click)="dlgTipos.close()" aria-label="Fechar"><i-con nome="fechar" /></button>
      </div>
      <p class="muted small">Os dois primeiros dígitos do código. Ex.: 01 = Telas.</p>
      <ul class="tipos">
        @for (t of tipos(); track t.id) {
          <li>
            <span class="etiqueta">{{ pad(t.id) }}</span>
            <input class="input" [ngModel]="t.nome" (change)="renomearTipo(t, $any($event.target).value)" [attr.aria-label]="'Nome do tipo ' + pad(t.id)" />
          </li>
        }
      </ul>
      <div class="novo-tipo">
        <label class="campo"><span>Número</span><input type="number" min="0" max="99" inputmode="numeric" [ngModel]="novoId()" (ngModelChange)="novoId.set($event)" /></label>
        <label class="campo"><span>Nome</span><input [ngModel]="novoNome()" (ngModelChange)="novoNome.set($event)" placeholder="Ex.: Conectores de carga" /></label>
        <button class="btn" (click)="criarTipo()" [disabled]="novoId() === null || !novoNome().trim()">Adicionar</button>
      </div>
    </dialog>
  `,
  styles: `
    .acoes { display: flex; gap: .4rem; }
    .grupo { display: flex; align-items: center; gap: .5rem; margin-bottom: .5rem; min-width: 0; }
    .grupo .conta { margin-left: auto; font-weight: 600; }
    .linha { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .75rem; align-items: start; padding: .8rem 1rem; color: inherit; text-decoration: none; }
    .linha .etiqueta { margin-top: .1rem; }
    .linha.inativo strong { color: var(--muted); }
    .nome { display: grid; gap: .1rem; min-width: 0; }
    .selos { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .25rem; }
    .sem-itens { padding: 0 .25rem; }
    section:has(.sem-itens) .lista { display: none; }
    .topo { display: flex; justify-content: space-between; align-items: center; }
    .tipos { list-style: none; padding: 0; margin: 1rem 0; display: grid; gap: .5rem; }
    .tipos li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .6rem; align-items: center; }
    .novo-tipo { display: grid; grid-template-columns: 90px 1fr; gap: .6rem; align-items: end; padding-top: 1rem; border-top: 1px solid var(--line); }
    .novo-tipo .btn { grid-column: 1 / -1; }
  `,
})
export class Produtos {
  private toast = inject(Toast);
  private router = inject(Router);
  protected termo = signal('');
  protected tipos = signal<Tipo[]>([]);
  protected produtos = signal<ProdutoLinha[]>([]);
  protected carregando = signal(true);
  protected erro = signal('');
  protected novoId = signal<number | null>(null);
  protected novoNome = signal('');
  private dlgTipos = viewChild.required<ElementRef<HTMLDialogElement>>('dlgTipos');

  protected grupos = computed(() => {
    const t = this.termo().trim().toLowerCase();
    const filtrados = this.produtos().filter(
      (p) => !t || [p.codigo, p.nome, p.marca, p.modelo, ...p.variacoes.map((v) => v.codigo_barras)].join(' ').toLowerCase().includes(t),
    );
    return this.tipos()
      .map((tipo) => ({ tipo, itens: filtrados.filter((p) => p.tipo_id === tipo.id) }))
      .filter((g) => !t || g.itens.length);
  });

  constructor() {
    this.carregar();
  }

  /** Código lido: abre o produto que já o tem (mesmo variação inativa) ou um cadastro novo já preenchido. */
  protected async porBarras(codigo: string) {
    const c = codigo.trim();
    const { data, error } = await supabase.from('variacoes').select('produto_id').eq('codigo_barras', c).maybeSingle();
    if (error) return this.toast.mostrar(mensagemErro(error), 'erro');
    if (data) {
      this.toast.mostrar('Esse código já está cadastrado: abrindo o produto.', 'info', 2500);
      this.router.navigate(['/admin/produtos', data.produto_id]);
    } else {
      this.router.navigate(['/admin/produtos/novo'], { queryParams: { barras: c } });
    }
  }

  protected pad(n: number) {
    return String(n).padStart(2, '0');
  }

  protected resumoVar(p: ProdutoLinha) {
    const ativas = p.variacoes.filter((v) => v.ativo).map((v) => v.nome);
    return [p.marca, ativas.join(', ')].filter(Boolean).join(' · ');
  }

  protected aConfirmar(p: ProdutoLinha) {
    return p.compatibilidades.filter((c) => c.status === 'a_confirmar').length;
  }

  private async carregar() {
    const [t, p] = await Promise.all([
      supabase.from('tipos').select('id, nome').order('id'),
      supabase
        .from('produtos')
        .select('id, codigo, tipo_id, nome, marca, modelo, ativo, variacoes(nome, ativo, codigo_barras), compatibilidades(status)')
        .order('codigo'),
    ]);
    this.carregando.set(false);
    if (t.error || p.error) return this.erro.set(mensagemErro(t.error ?? p.error));
    this.tipos.set(t.data as Tipo[]);
    this.produtos.set(p.data as unknown as ProdutoLinha[]);
  }

  protected abrirTipos() {
    const usados = new Set(this.tipos().map((t) => t.id));
    let prox = 1;
    while (usados.has(prox) && prox < 99) prox++;
    this.novoId.set(prox);
    this.dlgTipos().nativeElement.showModal();
  }

  protected async criarTipo() {
    const { error } = await supabase.from('tipos').insert({ id: Number(this.novoId()), nome: this.novoNome().trim() });
    if (error) return this.toast.mostrar(/duplicate/.test(error.message) ? 'Esse número ou nome de tipo já existe.' : mensagemErro(error), 'erro');
    this.novoNome.set('');
    await this.carregar();
    this.abrirTipos();
  }

  protected async renomearTipo(t: Tipo, nome: string) {
    if (!nome.trim() || nome === t.nome) return;
    const { error } = await supabase.from('tipos').update({ nome: nome.trim() }).eq('id', t.id);
    if (error) return this.toast.mostrar(mensagemErro(error), 'erro');
    this.toast.mostrar('Tipo renomeado', 'ok');
    this.carregar();
  }
}
