import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from './shared/ui';
import { AtualizacaoService } from './core/atualizacao.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    <!-- A região viva fica sempre na página; só o texto muda (leitores de tela anunciam) -->
    <div role="status" aria-live="polite" aria-atomic="true">
      @if (toast.atual(); as t) {
        <div class="toast" [class]="t.tipo">{{ t.texto }}</div>
      }
    </div>
  `,
  styles: `
    .toast {
      position: fixed; z-index: 100; left: 1rem; right: 1rem; top: calc(env(safe-area-inset-top, 0px) + .75rem);
      max-width: 520px; margin: 0 auto; padding: .85rem 1rem; border-radius: var(--r-md);
      background: var(--ink); color: #fff; font-weight: 600; box-shadow: 0 8px 24px rgb(23 33 48 / .25);
      animation: cair .2s ease-out;
    }
    .toast.ok { background: var(--ok); }
    .toast.erro { background: var(--danger); }
    @keyframes cair { from { transform: translateY(-12px); opacity: 0; } }
  `,
})
export class App {
  protected toast = inject(Toast);
  // Liga a atualização automática do PWA desde a abertura (inclusive na tela de entrar)
  private atualizacao = inject(AtualizacaoService);
}
