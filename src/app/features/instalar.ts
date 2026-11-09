import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { InstalacaoService } from '../core/instalacao.service';
import { Icone } from '../shared/ui';

/** /instalar — só o botão que instala o Liang (PWA). Pública, sem login. */
@Component({
  selector: 'app-instalar',
  imports: [Icone],
  template: `
    <main class="instalar">
      <img src="icons/icon-192x192.png" alt="" width="96" height="96" class="icone-app" />
      <h1>Liang</h1>
      @if (inst.instalado()) {
        <button class="btn bloco grande" type="button" (click)="abrir()">Abrir o Liang</button>
      } @else {
        <button class="btn bloco grande" type="button" (click)="instalar()" [disabled]="instalando()">
          <i-con nome="baixar" /> {{ instalando() ? 'Instalando…' : 'Baixar o aplicativo' }}
        </button>
      }
      <!-- Só aparece se o navegador não deixar instalar por botão (iPhone ou navegador sem suporte) -->
      <p class="dica small" aria-live="polite">{{ dica() }}</p>
    </main>
  `,
  styles: `
    .instalar { min-height: 100dvh; display: grid; align-content: center; justify-items: center; gap: 1.25rem; padding: 1.5rem 1rem; max-width: 380px; margin: 0 auto; text-align: center; }
    .icone-app { border-radius: 22px; box-shadow: 0 8px 24px rgb(23 33 48 / .2); }
    h1 { font-size: 2rem; }
    .grande { min-height: 60px; font-size: 1.15rem; }
    .dica { min-height: 2.6em; color: var(--muted); }
  `,
})
export class Instalar {
  protected inst = inject(InstalacaoService);
  private router = inject(Router);
  protected instalando = signal(false);
  protected dica = signal('');

  protected async instalar() {
    this.dica.set('');
    if (this.inst.podeInstalar()) {
      this.instalando.set(true);
      try {
        if (await this.inst.instalar()) this.dica.set('Pronto! O Liang está na tela inicial.');
      } finally {
        this.instalando.set(false);
      }
      return;
    }
    // A Apple não deixa site nenhum instalar por botão: só pelo menu do Safari
    this.dica.set(
      this.inst.ios
        ? 'No iPhone: toque em Compartilhar e depois em "Adicionar à Tela de Início".'
        : 'Abra este link no Chrome para baixar o aplicativo.',
    );
  }

  protected abrir() {
    this.router.navigateByUrl('/entrar');
  }
}
