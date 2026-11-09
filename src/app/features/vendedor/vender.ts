import { Component, ElementRef, Injectable, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogoService, normalizarCodigo } from '../../core/catalogo.service';
import { VendasService } from '../../core/vendas.service';
import { AuthService } from '../../core/auth.service';
import {
  FormaPagamento,
  ItemCarrinho,
  ItemCatalogo,
  PAGAMENTOS,
  TipoPreco,
  pagamentosPermitidos,
  precoDe,
} from '../../core/models';
import { BrlPipe, Icone, Toast, formatarBRL } from '../../shared/ui';
import { Scanner } from '../../shared/scanner';

/** Carrinho fica vivo enquanto o vendedor navega entre as abas. */
@Injectable({ providedIn: 'root' })
export class CarrinhoService {
  readonly itens = signal<ItemCarrinho[]>([]);
  readonly tipo = signal<TipoPreco>('varejo');
  readonly cliente = signal('');
  readonly pagamento = signal<FormaPagamento | null>(null);

  constructor() {
    const auth = inject(AuthService);
    const catalogo = inject(CatalogoService);
    // O carrinho é de quem está logado: trocou de usuário no aparelho, começa vazio
    let dono: string | undefined;
    effect(() => {
      const id = auth.perfil()?.id;
      untracked(() => {
        if (dono !== undefined && id !== dono) this.limpar();
        dono = id;
      });
    });
    // Preço e estoque do carrinho acompanham o catálogo atualizado
    effect(() => {
      const mapa = new Map(catalogo.itens().map((i) => [i.variacao_id, i]));
      untracked(() =>
        this.itens.update((l) =>
          l.map((x) => {
            const atual = mapa.get(x.item.variacao_id);
            return atual && atual !== x.item ? { ...x, item: atual } : x;
          }),
        ),
      );
    });
  }

  limpar() {
    this.itens.set([]);
    this.cliente.set('');
    this.pagamento.set(null);
  }
}

@Component({
  selector: 'app-vender',
  imports: [FormsModule, BrlPipe, Icone, Scanner],
  template: `
    <main class="pagina">
      <header class="cabecalho">
        <h1>Vender</h1>
        <div class="segmento tipo" role="group" aria-label="Tipo de preço">
          <button type="button" [attr.aria-pressed]="c.tipo() === 'varejo'" (click)="mudarTipo('varejo')">Varejo</button>
          <button type="button" [attr.aria-pressed]="c.tipo() === 'atacado'" (click)="mudarTipo('atacado')">Atacado</button>
        </div>
      </header>

      @for (a of vendas.meusAvisos(); track a.id) {
        <div class="aviso" role="alert">
          <i-con nome="alerta" />
          <div>
            <strong>Venda para {{ a.cliente }} não foi registrada</strong>
            <p class="small">{{ a.motivo }} O administrador foi avisado.</p>
          </div>
          <button class="btn-icone" (click)="vendas.dispensarAviso(a.id)" aria-label="Dispensar aviso"><i-con nome="fechar" /></button>
        </div>
      }

      <!-- Entrada de código: o elemento central da tela -->
      <section class="leitor" [class.erro]="erroCodigo()">
        <label for="codigo" class="rotulo">Código do produto ou de barras</label>
        <div class="linha">
          <input
            #campo
            id="codigo"
            class="codigo"
            [ngModel]="entrada()"
            (ngModelChange)="digitar($event)"
            (keydown.enter)="confirmarEntrada()"
            inputmode="numeric"
            autocomplete="off"
            placeholder="00-00"
            enterkeyhint="search"
          />
          <button class="btn-icone acao" (click)="scanner.abrir()" aria-label="Ler com a câmera"><i-con nome="scan" /></button>
        </div>
        <p class="dica small" aria-live="polite">{{ erroCodigo() || 'Digite os 4 números. O produto entra no carrinho na hora.' }}</p>
      </section>

      <section class="carrinho" aria-label="Itens da venda">
        @if (c.itens().length === 0) {
          <p class="vazio">Nenhum item. Digite um código acima ou leia um código de barras.</p>
        } @else {
          <ul class="lista">
            @for (l of c.itens(); track l.item.variacao_id) {
              <li class="item">
                <span class="etiqueta">{{ l.item.codigo }}</span>
                <div class="info">
                  <strong class="clamp-2">{{ l.item.nome }}</strong>
                  <span class="muted small">{{ l.item.variacao }}</span>
                </div>
                <div class="rodape-item">
                <div class="qtd">
                  <button class="btn-icone" (click)="alterar(l, -1)" [attr.aria-label]="l.quantidade === 1 ? 'Remover' : 'Diminuir'">
                    <i-con [nome]="l.quantidade === 1 ? 'apagar' : 'menos'" />
                  </button>
                  <span class="num">{{ l.quantidade }}</span>
                  <button class="btn-icone" (click)="alterar(l, 1)" [disabled]="l.quantidade >= l.item.estoque" aria-label="Aumentar"><i-con nome="mais1" /></button>
                </div>
                <span class="valores">
                  <span class="muted small unit">{{ preco(l.item) | brl }} un. · {{ l.item.estoque }} disp.</span>
                  <strong class="num">{{ preco(l.item) * l.quantidade | brl }}</strong>
                </span>
                </div>
              </li>
            }
          </ul>
        }
      </section>
    </main>

    @if (c.itens().length) {
      <div class="barra">
        <div>
          <span class="muted small">{{ qtdItens() }} {{ qtdItens() === 1 ? 'item' : 'itens' }} · {{ c.tipo() === 'atacado' ? 'Atacado' : 'Varejo' }}</span>
          <strong class="total num">{{ total() | brl }}</strong>
        </div>
        <button class="btn" (click)="abrirFinalizar()">Finalizar venda</button>
      </div>
    }

    <!-- Escolha de variação -->
    <dialog #dlgVar class="folha" aria-label="Escolher variação">
      @if (opcoes().length) {
        <div class="topo-folha">
          <div>
            <span class="etiqueta">{{ opcoes()[0].codigo }}</span>
            <h2>{{ opcoes()[0].nome }}</h2>
          </div>
          <button class="btn-icone" (click)="dlgVar.close()" aria-label="Fechar"><i-con nome="fechar" /></button>
        </div>
        <p class="muted small">Escolha a variação</p>
        <ul class="lista opcoes">
          @for (o of opcoes(); track o.variacao_id) {
            <li>
              <button class="opcao" (click)="adicionar(o); dlgVar.close()" [disabled]="disponivel(o) <= 0">
                <span><strong>{{ o.variacao }}</strong><br /><span class="small muted">{{ disponivel(o) }} disponível(is)</span></span>
                <span class="num preco">{{ preco(o) | brl }}</span>
              </button>
            </li>
          }
        </ul>
      }
    </dialog>

    <!-- Finalizar: cliente, pagamento e confirmação -->
    <dialog #dlgFim class="folha" aria-labelledby="fim-titulo">
      <div class="topo-folha">
        <h2 id="fim-titulo">{{ confirmando() ? 'Confirmar venda' : 'Finalizar venda' }}</h2>
        <button class="btn-icone" (click)="dlgFim.close()" aria-label="Fechar"><i-con nome="fechar" /></button>
      </div>

      @if (!confirmando()) {
        <div class="form">
          <label class="campo">
            <span>Nome do cliente</span>
            <input [ngModel]="c.cliente()" (ngModelChange)="c.cliente.set($event)" autocomplete="off" autocapitalize="words" maxlength="120" />
          </label>
          <div class="campo">
            <span>Forma de pagamento</span>
            <div class="segmento" role="group" aria-label="Forma de pagamento">
              @for (p of todosPagamentos; track p) {
                <button type="button" [attr.aria-pressed]="c.pagamento() === p" [disabled]="!permitido(p)" (click)="c.pagamento.set(p)">{{ nomes[p] }}</button>
              }
            </div>
            @if (c.tipo() === 'atacado') {
              <span class="small muted">Atacado aceita só dinheiro ou Pix.</span>
            }
          </div>
          <button class="btn bloco" [disabled]="!c.cliente().trim() || !c.pagamento()" (click)="confirmando.set(true)">Revisar venda</button>
        </div>
      } @else {
        <div class="resumo">
          <dl>
            <div class="inteira"><dt>Cliente</dt><dd>{{ c.cliente() }}</dd></div>
            <div><dt>Preço</dt><dd>{{ c.tipo() === 'atacado' ? 'Atacado' : 'Varejo' }}</dd></div>
            <div><dt>Pagamento</dt><dd>{{ nomes[c.pagamento()!] }}</dd></div>
            <div><dt>Vendedor</dt><dd>{{ auth.perfil()?.nome }}</dd></div>
          </dl>
          <ul class="itens-resumo">
            @for (l of c.itens(); track l.item.variacao_id) {
              <li><span class="num">{{ l.quantidade }}×</span> <span class="clamp-2">{{ l.item.codigo }} {{ l.item.nome }} · {{ l.item.variacao }}</span> <span class="num">{{ preco(l.item) * l.quantidade | brl }}</span></li>
            }
          </ul>
          <p class="total-resumo"><span>Total</span><strong class="num">{{ total() | brl }}</strong></p>
          <div class="acoes">
            <button class="btn sec" (click)="confirmando.set(false)" [disabled]="enviando()">Voltar</button>
            <button class="btn ok" (click)="confirmar()" [disabled]="enviando()">{{ enviando() ? 'Registrando…' : 'Confirmar venda' }}</button>
          </div>
        </div>
      }
    </dialog>

    <app-scanner #scanner (lido)="lerBarras($event)" />
  `,
  styles: `
    .tipo { width: 190px; }
    .aviso { display: flex; gap: .6rem; align-items: flex-start; padding: .8rem; border-radius: var(--r-md); background: var(--danger-bg); color: var(--danger); }
    .aviso div { flex: 1; }

    .leitor { background: var(--ink); color: #fff; border-radius: var(--r-lg); padding: 1rem; display: grid; grid-template-columns: minmax(0, 1fr); gap: .5rem; }
    .rotulo { font-size: .85rem; font-weight: 650; color: #b9c2cf; }
    .linha { display: flex; gap: .5rem; align-items: stretch; }
    .codigo {
      flex: 1; min-width: 0; height: 76px; padding: 0 1rem 0 1.6rem;
      font: inherit; font-size: clamp(2rem, 11vw, 2.6rem); font-weight: 800; font-stretch: 125%; letter-spacing: .04em;
      font-variant-numeric: tabular-nums; color: var(--ink);
      background: var(--label) radial-gradient(circle at .75rem 50%, var(--ink) .32rem, transparent .34rem);
      border: 2px solid var(--label-edge); border-radius: 6px;
    }
    .codigo::placeholder { color: rgb(23 33 48 / .3); }
    .codigo:focus { outline: 3px solid #fff; outline-offset: 2px; }
    .acao { width: clamp(60px, 18vw, 76px); height: 76px; flex: none; border-radius: var(--r-md); background: #2a3647; color: #fff; }
    .acao i-con { transform: scale(1.3); }
    .dica { color: #b9c2cf; min-height: 1.3em; }
    .leitor.erro .dica { color: #ffb4b4; font-weight: 650; }
    .leitor.erro .codigo { animation: tremer .25s; }
    @keyframes tremer { 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }

    /* etiqueta | nome            */
    /* stepper   | preço · total  */
    .item { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .6rem .7rem; padding: .85rem 1rem; align-items: start; }
    .item .etiqueta { margin-top: .1rem; }
    .info { display: grid; gap: .1rem; min-width: 0; }
    .rodape-item { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; gap: .75rem; }
    .qtd { display: flex; align-items: center; background: var(--paper); border-radius: 99px; flex: none; }
    .qtd span { min-width: 1.6rem; text-align: center; font-weight: 750; }
    .valores { display: grid; justify-items: end; line-height: 1.25; min-width: 0; }
    .valores strong { font-size: 1.05rem; }
    .unit { font-variant-numeric: tabular-nums; text-align: right; }

    .barra {
      position: fixed; z-index: 25; left: 0; right: 0; bottom: calc(var(--nav-h) + var(--safe-b));
      display: flex; justify-content: space-between; align-items: center; gap: 1rem;
      padding: .75rem 1rem; background: var(--surface); border-top: 1px solid var(--line);
      box-shadow: 0 -6px 18px rgb(23 33 48 / .08);
    }
    .barra div { display: grid; min-width: 0; }
    .total { font-size: clamp(1.1rem, 5.5vw, 1.4rem); font-stretch: 112%; }
    .barra .btn { flex: none; padding: 0 clamp(.8rem, 4vw, 1.1rem); }
    :host ::ng-deep .pagina { padding-bottom: calc(var(--nav-h) + var(--safe-b) + 6rem); }

    .topo-folha { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 1rem; margin-bottom: .75rem; }
    .topo-folha h2 { margin-top: .35rem; }
    .opcoes { margin-top: .5rem; box-shadow: inset 0 0 0 1.5px var(--line); }
    .opcao { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 1rem; padding: .9rem 1rem; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
    .opcao:disabled { opacity: .4; }
    .opcao:active { background: var(--paper); }
    .preco { font-weight: 750; font-size: 1.1rem; }

    .form { display: grid; gap: 1rem; }
    .resumo { display: grid; gap: 1rem; }
    dl { margin: 0; display: grid; grid-template-columns: repeat(3, auto); justify-content: space-between; gap: .6rem 1rem; }
    dl .inteira { grid-column: 1 / -1; }
    dt { font-size: .8rem; color: var(--muted); font-weight: 650; }
    dd { margin: 0; font-weight: 700; }
    .itens-resumo { list-style: none; margin: 0; padding: .75rem 0; border-block: 1px solid var(--line); display: grid; gap: .45rem; }
    .itens-resumo li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .5rem; font-size: .92rem; }
    .total-resumo { display: flex; justify-content: space-between; align-items: baseline; font-size: 1.1rem; }
    .total-resumo strong { font-size: 1.6rem; font-stretch: 112%; }
    .acoes { display: grid; grid-template-columns: 1fr 2fr; gap: .6rem; }
  `,
})
export class Vender {
  protected c = inject(CarrinhoService);
  protected vendas = inject(VendasService);
  protected auth = inject(AuthService);
  private catalogo = inject(CatalogoService);
  private toast = inject(Toast);

  protected entrada = signal('');
  protected erroCodigo = signal('');
  protected opcoes = signal<ItemCatalogo[]>([]);
  protected confirmando = signal(false);
  protected enviando = signal(false);

  protected readonly nomes = PAGAMENTOS;
  protected readonly todosPagamentos: FormaPagamento[] = ['dinheiro', 'pix', 'cartao'];

  private campo = viewChild.required<ElementRef<HTMLInputElement>>('campo');
  private dlgVar = viewChild.required<ElementRef<HTMLDialogElement>>('dlgVar');
  private dlgFim = viewChild.required<ElementRef<HTMLDialogElement>>('dlgFim');

  protected total = computed(() => this.c.itens().reduce((s, l) => s + precoDe(l.item, this.c.tipo()) * l.quantidade, 0));
  protected qtdItens = computed(() => this.c.itens().reduce((s, l) => s + l.quantidade, 0));

  protected preco(i: ItemCatalogo) {
    return precoDe(i, this.c.tipo());
  }

  protected permitido(p: FormaPagamento) {
    return pagamentosPermitidos(this.c.tipo()).includes(p);
  }

  protected mudarTipo(t: TipoPreco) {
    this.c.tipo.set(t);
    if (this.c.pagamento() && !this.permitido(this.c.pagamento()!)) this.c.pagamento.set(null);
  }

  /** Quanto ainda pode ser adicionado, descontando o que já está no carrinho. */
  protected disponivel(i: ItemCatalogo) {
    const no = this.c.itens().find((l) => l.item.variacao_id === i.variacao_id)?.quantidade ?? 0;
    return i.estoque - no;
  }

  protected digitar(v: string) {
    this.erroCodigo.set('');
    const so = v.replace(/[^\d-]/g, '');
    // Até 4 dígitos: formata como 00-00 enquanto digita
    const digitos = so.replace(/-/g, '');
    if (digitos.length <= 4 && !so.includes('-')) {
      this.entrada.set(digitos.length > 2 ? `${digitos.slice(0, 2)}-${digitos.slice(2)}` : digitos);
      if (digitos.length === 4) this.buscarCodigo(this.entrada());
    } else {
      this.entrada.set(so);
    }
  }

  protected confirmarEntrada() {
    const v = this.entrada().trim();
    if (!v) return;
    const digitos = v.replace(/\D/g, '');
    if (digitos.length > 4) this.lerBarras(digitos);
    else this.buscarCodigo(v);
  }

  private buscarCodigo(v: string) {
    const cod = normalizarCodigo(v);
    const achados = this.catalogo.buscarCodigo(v);
    if (!achados.length) return this.falhar(`Código ${cod ?? v} não está no catálogo.`);
    const comEstoque = achados.filter((i) => this.disponivel(i) > 0);
    if (!comEstoque.length) return this.falhar(`${achados[0].codigo} ${achados[0].nome} está sem estoque.`);
    if (achados.length === 1) {
      this.adicionar(achados[0]);
    } else {
      this.opcoes.set(achados);
      this.dlgVar().nativeElement.showModal();
    }
    this.entrada.set('');
  }

  protected lerBarras(codigo: string) {
    const item = this.catalogo.buscarBarras(codigo);
    this.entrada.set('');
    if (!item) return this.falhar('Código de barras não cadastrado. Só é possível vender produtos do catálogo.');
    if (this.disponivel(item) <= 0) return this.falhar(`${item.codigo} ${item.nome} · ${item.variacao} está sem estoque.`);
    this.adicionar(item);
  }

  protected adicionar(item: ItemCatalogo) {
    if (this.disponivel(item) <= 0) return this.falhar('Sem estoque para adicionar mais.');
    this.c.itens.update((l) => {
      const ex = l.find((x) => x.item.variacao_id === item.variacao_id);
      return ex
        ? l.map((x) => (x === ex ? { ...x, quantidade: x.quantidade + 1 } : x))
        : [...l, { item, quantidade: 1 }];
    });
    navigator.vibrate?.(30);
    this.campo().nativeElement.focus();
  }

  protected alterar(l: ItemCarrinho, d: number) {
    const q = l.quantidade + d;
    this.c.itens.update((lista) =>
      q <= 0 ? lista.filter((x) => x !== l) : lista.map((x) => (x === l ? { ...x, quantidade: Math.min(q, x.item.estoque) } : x)),
    );
  }

  private falhar(msg: string) {
    this.erroCodigo.set(msg);
    navigator.vibrate?.([40, 40, 40]);
  }

  protected abrirFinalizar() {
    this.confirmando.set(false);
    this.dlgFim().nativeElement.showModal();
  }

  protected async confirmar() {
    this.enviando.set(true);
    try {
      const r = await this.vendas.finalizar(this.c.itens(), this.c.cliente(), this.c.tipo(), this.c.pagamento()!);
      if (r.status === 'recusada') {
        this.toast.mostrar(r.motivo, 'erro', 6000);
        return;
      }
      this.toast.mostrar(
        r.status === 'registrada'
          ? `Venda registrada · ${formatarBRL(r.total)}`
          : `Sem internet: venda guardada no aparelho (${formatarBRL(r.total)}). Envio automático quando conectar.`,
        r.status === 'registrada' ? 'ok' : 'info',
        r.status === 'registrada' ? 3500 : 6000,
      );
      this.c.limpar();
      this.dlgFim().nativeElement.close();
    } finally {
      this.enviando.set(false);
    }
  }
}
