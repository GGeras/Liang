import { Component, DestroyRef, ElementRef, inject, input, signal, viewChild } from '@angular/core';

let proximo = 0;
/** Só um balão aberto por vez. */
let fecharAberto: (() => void) | null = null;

/**
 * Botão "?" que explica um campo ou bloco em uma frase.
 * Usar com parcimônia: só onde o rótulo sozinho não basta.
 * - Toque abre o balão; toque fora, Esc, rolar a tela ou tocar de novo fecha.
 * - Leitor de tela ouve a frase ao focar o botão (aria-describedby), sem precisar abrir.
 * - O balão fica na camada do topo (popover): aparece por cima de folhas e não estoura a tela.
 * - NÃO colocar dentro de <label>: o "?" entraria no nome do campo. Ver `.rotulo-ajuda`.
 */
@Component({
  selector: 'app-ajuda',
  template: `
    <button #botao type="button" class="ajuda-btn" [attr.aria-label]="'Ajuda: ' + sobre()" [attr.aria-expanded]="aberta()" [attr.aria-describedby]="id" (click)="alternar()">
      <span aria-hidden="true">?</span>
    </button>
    <span #balao class="ajuda-balao" popover="manual" [id]="id">{{ texto() }}</span>
  `,
  styles: `
    :host { display: inline-flex; vertical-align: middle; }
    .ajuda-btn {
      display: inline-grid; place-items: center; flex: none;
      width: 28px; height: 28px; margin: -4px 0; padding: 0;
      border: 0; border-radius: 50%; background: none; cursor: pointer; color: var(--ajuda-cor, var(--cobalt));
    }
    .ajuda-btn span {
      display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%;
      border: 1.5px solid currentColor; font: 800 .75rem/1 var(--font, inherit);
    }
    .ajuda-btn[aria-expanded='true'] span { background: var(--ajuda-cor, var(--cobalt)); color: var(--ajuda-fundo, #fff); border-color: var(--ajuda-cor, var(--cobalt)); }
    .ajuda-btn:focus-visible { outline: 3px solid var(--ajuda-cor, var(--cobalt)); outline-offset: 1px; }
    .ajuda-balao {
      position: fixed; inset: auto; margin: 0; width: max-content; max-width: min(300px, calc(100vw - 32px));
      padding: .6rem .75rem; border: 0; border-radius: 10px;
      background: var(--ink); color: #fff; box-shadow: 0 8px 24px rgb(23 33 48 / .3), 0 0 0 1px rgb(255 255 255 / .18);
      font-size: .875rem; font-weight: 500; line-height: 1.35; text-align: left; white-space: normal;
    }
    /* Sem suporte a popover: o balão fica escondido (a frase continua no leitor de tela) */
    .ajuda-balao:not(:popover-open) { display: none; }
  `,
})
export class Ajuda {
  /** Do que se trata (vira "Ajuda: …" para o leitor de tela). */
  readonly sobre = input.required<string>();
  /** A explicação: uma frase. */
  readonly texto = input.required<string>();

  protected readonly id = `ajuda-${++proximo}`;
  protected aberta = signal(false);
  private botao = viewChild.required<ElementRef<HTMLButtonElement>>('botao');
  private balao = viewChild.required<ElementRef<HTMLElement>>('balao');

  private fora = (e: Event) => {
    const t = e.target as Node;
    if (!this.botao().nativeElement.contains(t) && !this.balao().nativeElement.contains(t)) this.fechar();
  };
  private tecla = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.aberta()) {
      e.preventDefault();
      e.stopPropagation(); // não fecha a folha (dialog) junto
      this.fechar();
      this.botao().nativeElement.focus();
    }
  };
  private rolou = () => this.fechar();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.fechar());
  }

  protected alternar() {
    if (this.aberta()) this.fechar();
    else this.abrir();
  }

  private abrir() {
    const b = this.balao().nativeElement;
    if (typeof b.showPopover !== 'function') return;
    fecharAberto?.();
    b.showPopover();
    this.posicionar();
    this.aberta.set(true);
    fecharAberto = () => this.fechar();
    // No próximo ciclo: o próprio toque que abriu não pode fechar
    setTimeout(() => {
      if (!this.aberta()) return;
      document.addEventListener('pointerdown', this.fora, true);
      document.addEventListener('keydown', this.tecla, true);
      addEventListener('scroll', this.rolou, { capture: true, passive: true });
      addEventListener('resize', this.rolou);
    });
  }

  private fechar() {
    if (!this.aberta()) return;
    this.aberta.set(false);
    if (fecharAberto) fecharAberto = null;
    const b = this.balao().nativeElement;
    if (b.matches(':popover-open')) b.hidePopover();
    document.removeEventListener('pointerdown', this.fora, true);
    document.removeEventListener('keydown', this.tecla, true);
    removeEventListener('scroll', this.rolou, { capture: true });
    removeEventListener('resize', this.rolou);
  }

  /** Abaixo do "?" (ou acima, se não couber), sempre 16 px longe das bordas da tela. */
  private posicionar() {
    const r = this.botao().nativeElement.getBoundingClientRect();
    const b = this.balao().nativeElement;
    const { width: w, height: h } = b.getBoundingClientRect();
    const margem = 16;
    const left = Math.min(Math.max(margem, r.left + r.width / 2 - w / 2), innerWidth - margem - w);
    const abaixo = r.bottom + 6;
    const top = abaixo + h > innerHeight - margem ? Math.max(margem, r.top - 6 - h) : abaixo;
    b.style.left = `${left}px`;
    b.style.top = `${top}px`;
  }
}
