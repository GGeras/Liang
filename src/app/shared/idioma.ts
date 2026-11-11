import { Component, inject } from '@angular/core';
import { Idioma, IdiomaService } from '../core/idioma.service';

/** Escolha do idioma do sistema. Fica sempre bilíngue, para quem não lê o idioma atual achar. */
@Component({
  selector: 'app-idioma',
  template: `
    <div class="idioma" role="group" aria-labelledby="idioma-rotulo" translate="no">
      <span id="idioma-rotulo" class="small muted">Idioma · 语言</span>
      <div class="opcoes">
        @for (o of opcoes; track o.id) {
          <button
            type="button"
            class="chip"
            [attr.lang]="o.id"
            [attr.aria-pressed]="idioma.idioma() === o.id"
            (click)="idioma.definir(o.id)"
          >
            {{ o.nome }}
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .idioma { display: flex; align-items: center; justify-content: space-between; gap: .75rem; flex-wrap: wrap; }
    .opcoes { display: flex; gap: .5rem; }
  `,
})
export class SeletorIdioma {
  protected idioma = inject(IdiomaService);
  protected opcoes: { id: Idioma; nome: string }[] = [
    { id: 'pt-BR', nome: 'Português' },
    { id: 'zh-CN', nome: '中文' },
  ];
}
