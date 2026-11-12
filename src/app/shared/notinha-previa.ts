import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DadosLoja, NotinhaVenda } from '../core/models';
import { LojaService } from '../core/loja.service';
import { NotinhaService } from '../core/notinha.service';
import { Notinha } from './notinha';
import { Icone } from './ui';

/**
 * Simulação da notinha: uma tira de papel térmico de 80 mm sobre fundo escuro.
 * O conteúdo é o próprio <app-notinha>, com o mesmo CSS da impressão; o papel,
 * a serrilha e a linha de corte ficam por fora e não saem na impressora.
 * "Ver tamanho real" mostra a tira em escala 1:1 (CSS em mm).
 */
@Component({
  selector: 'app-simulacao-notinha',
  imports: [Notinha, Icone],
  template: `
    <div class="mesa" #mesa [class.real]="real()">
      <div class="controles">
        <button type="button" class="btn sec pequeno" [attr.aria-pressed]="real()" (click)="real.set(!real())">
          <i-con [nome]="real() ? 'ajustar' : 'regua'" />
          {{ real() ? 'Ajustar à tela' : 'Ver tamanho real' }}
        </button>
        @if (real()) {
          <p class="small dica">Escala 1:1, com o zoom do navegador em 100%.</p>
        }
      </div>
      <div class="ajuste" [style.width.px]="largura() * escala()" [style.height.px]="altura() * escala()">
        <div class="tira" #tira [style.transform]="'scale(' + escala() + ')'">
          <div class="papel">
            <app-notinha [venda]="venda()" [loja]="loja()" />
            <div class="corte" aria-hidden="true" title="A impressora corta aqui"></div>
            <div class="sobra"></div>
          </div>
          <div class="serrilha" aria-hidden="true"></div>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .mesa {
      --papel-termico: #f6f6f2;
      display: grid; justify-items: center; gap: .9rem;
      padding: .9rem .75rem 1.5rem; border-radius: var(--r-lg);
      background: #111821; color: #fff;
      overflow-x: auto; overscroll-behavior-x: contain;
    }
    .controles { display: grid; justify-items: center; gap: .3rem; text-align: center; }
    .dica { color: #c3cbd6; }
    .ajuste { position: relative; flex: none; }
    .tira {
      position: absolute; top: 0; left: 0; width: 80mm;
      transform-origin: 0 0;
      filter: drop-shadow(0 3px 6px rgb(0 0 0 / .45));
    }
    .papel { background: var(--papel-termico); }
    /* Onde a impressora corta: linha discreta, só na tela */
    .corte { height: 0; margin: 0 1.5mm; border-top: 1px dashed #9aa3ae; }
    .sobra { height: 4mm; }
    /* Borda de papel cortado */
    .serrilha {
      height: 2.4mm;
      background:
        linear-gradient(135deg, var(--papel-termico) 50%, transparent 50%) 0 0 / 2.4mm 2.4mm repeat-x,
        linear-gradient(225deg, var(--papel-termico) 50%, transparent 50%) 0 0 / 2.4mm 2.4mm repeat-x;
    }
  `,
})
export class SimulacaoNotinha {
  readonly venda = input.required<NotinhaVenda>();
  readonly loja = input.required<DadosLoja>();
  protected real = signal(false);

  private mesa = viewChild.required<ElementRef<HTMLElement>>('mesa');
  private tira = viewChild.required<ElementRef<HTMLElement>>('tira');
  protected largura = signal(0);
  protected altura = signal(0);
  private disponivel = signal(0);

  /** Ajustada à largura disponível (até 1,5× no PC); 1 no tamanho real. */
  protected escala = computed(() => {
    if (this.real() || !this.largura()) return 1;
    return Math.min(1.5, this.disponivel() / this.largura());
  });

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const ro = new ResizeObserver(() => this.medir());
      ro.observe(this.mesa().nativeElement);
      ro.observe(this.tira().nativeElement);
      destroy.onDestroy(() => ro.disconnect());
      this.medir();
    });
  }

  private medir() {
    const m = this.mesa().nativeElement;
    const t = this.tira().nativeElement;
    const cs = getComputedStyle(m);
    this.disponivel.set(m.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    // offsetWidth/Height não sofrem o scale: é o tamanho real da tira
    this.largura.set(t.offsetWidth);
    this.altura.set(t.offsetHeight);
  }
}

/** Folha da notinha: simulação + Imprimir e Fechar. Fica no Shell; abre por NotinhaService.abrir(). */
@Component({
  selector: 'app-previa-notinha',
  imports: [SimulacaoNotinha, Icone],
  template: `
    <dialog #dlg class="previa" aria-label="Notinha" (close)="notinha.fechar()">
      @if (notinha.aberta(); as v) {
        <div class="topo">
          <h2>Notinha</h2>
          <button type="button" class="btn-icone" (click)="dlg.close()" aria-label="Fechar"><i-con nome="fechar" /></button>
        </div>
        <div class="corpo">
          <app-simulacao-notinha [venda]="v" [loja]="loja.dados()" />
        </div>
        <div class="acoes">
          <button type="button" class="btn sec" (click)="dlg.close()">Fechar</button>
          <button type="button" class="btn" (click)="notinha.imprimir(v)"><i-con nome="imprimir" /> Imprimir</button>
        </div>
      }
    </dialog>
  `,
  styles: `
    dialog.previa {
      width: 100%; max-width: 100%; height: 100dvh; max-height: 100dvh;
      margin: 0; padding: 0; border: 0;
      background: #111821; color: #fff;
    }
    dialog.previa[open] { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
    dialog.previa::backdrop { background: #111821; }
    .topo {
      display: flex; justify-content: space-between; align-items: center; gap: 1rem;
      padding: calc(env(safe-area-inset-top, 0px) + .5rem) .5rem .25rem 1rem;
    }
    .corpo { overflow-y: auto; padding: 0 .25rem; }
    .acoes {
      display: grid; grid-template-columns: 1fr 2fr; gap: .6rem;
      padding: .75rem 1rem calc(.75rem + var(--safe-b));
      border-top: 1px solid #2a3647;
    }
    @media (min-width: 720px) {
      .acoes { max-width: 520px; width: 100%; margin: 0 auto; border-top: 0; }
    }
  `,
})
export class PreviaNotinha {
  protected notinha = inject(NotinhaService);
  protected loja = inject(LojaService);
  private dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const d = this.dlg().nativeElement;
      if (this.notinha.aberta() && !d.open) d.showModal();
      else if (!this.notinha.aberta() && d.open) d.close();
    });
  }
}
