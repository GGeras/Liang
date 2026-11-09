import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InstalacaoService } from '../core/instalacao.service';
import { Icone } from '../shared/ui';

/** /instalar — instala o Liang na tela inicial do celular (PWA). Pública, sem login. */
@Component({
  selector: 'app-instalar',
  imports: [RouterLink, Icone],
  template: `
    <main class="instalar">
      <div class="marca">
        <img src="icons/icon-192x192.png" alt="" width="72" height="72" class="icone-app" />
        <h1>Instalar o Liang</h1>
        <p class="muted">Estoque Mundo Mix na tela inicial do celular: abre em tela cheia e funciona sem internet.</p>
      </div>

      <section class="painel caixa">
        @if (inst.instalado()) {
          <p class="ok"><i-con nome="check" /> O Liang já está instalado neste aparelho.</p>
          <a class="btn bloco" routerLink="/entrar">Abrir o Liang</a>
        } @else if (inst.podeInstalar()) {
          <button class="btn bloco grande" type="button" (click)="instalar()" [disabled]="instalando()">
            <i-con nome="baixar" /> {{ instalando() ? 'Instalando…' : 'Instalar o Liang' }}
          </button>
          @if (recusou()) {
            <p class="muted small">Instalação cancelada. Toque no botão de novo quando quiser.</p>
          }
        } @else if (inst.ios) {
          <h2>No iPhone (Safari)</h2>
          <ol>
            <li>Toque em <strong>Compartilhar</strong> (quadrado com seta para cima), na barra do Safari.</li>
            <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
            <li>Toque em <strong>Adicionar</strong>.</li>
          </ol>
          <p class="muted small">No iPhone a instalação só funciona pelo Safari.</p>
        } @else {
          <h2>Instalar pelo menu do navegador</h2>
          <ol>
            <li>Abra esta página no <strong>Chrome</strong> (Android) ou no <strong>Edge</strong>.</li>
            <li>Toque no menu <strong>⋮</strong> e escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
          </ol>
          <p class="muted small">Se o botão de instalar não apareceu, o navegador ainda está preparando o app: recarregue a página em alguns segundos.</p>
        }
      </section>

      @if (!inst.instalado()) {
        <a class="link-entrar" routerLink="/entrar">Continuar no navegador</a>
      }
    </main>
  `,
  styles: `
    .instalar { min-height: 100dvh; display: grid; align-content: center; gap: 1.25rem; padding: 1.5rem 1rem; max-width: 420px; margin: 0 auto; }
    .marca { display: grid; gap: .5rem; justify-items: start; }
    .icone-app { border-radius: 18px; box-shadow: 0 6px 18px rgb(23 33 48 / .18); }
    .marca h1 { font-size: 2rem; }
    .caixa { display: grid; gap: .9rem; padding: 1.25rem; }
    .grande { min-height: 56px; font-size: 1.1rem; }
    .ok { display: flex; gap: .5rem; align-items: center; color: var(--ok); font-weight: 700; }
    ol { margin: 0; padding-left: 1.25rem; display: grid; gap: .5rem; }
    .link-entrar { justify-self: center; display: inline-flex; align-items: center; min-height: 44px; padding-inline: .75rem; color: var(--cobalt); font-weight: 650; }
  `,
})
export class Instalar {
  protected inst = inject(InstalacaoService);
  protected instalando = signal(false);
  protected recusou = signal(false);

  protected async instalar() {
    this.instalando.set(true);
    this.recusou.set(false);
    try {
      this.recusou.set(!(await this.inst.instalar()));
    } finally {
      this.instalando.set(false);
    }
  }
}
