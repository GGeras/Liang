import { Component, input, output } from '@angular/core';
import { DataHoraPipe, Icone } from './ui';

/** "Alterações não salvas recuperadas" com o botão de descartar (formulários com rascunho). */
@Component({
  selector: 'app-aviso-rascunho',
  imports: [DataHoraPipe, Icone],
  template: `
    <div class="aviso-rascunho" role="status">
      <i-con nome="historico" />
      <p>
        <strong>Alterações não salvas recuperadas</strong><br />
        <span class="small">Feitas em {{ em() | dataHora }}. Revise e salve.</span>
      </p>
      <button type="button" class="btn sec pequeno" (click)="descartar.emit()">Descartar</button>
    </div>
  `,
  styles: `
    .aviso-rascunho {
      display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: .3rem .6rem;
      padding: .8rem; border-radius: var(--r-md); background: var(--warn-bg); color: var(--warn);
    }
    .aviso-rascunho p { margin: 0; }
    .aviso-rascunho .btn { grid-column: 2; justify-self: start; color: var(--ink); }
  `,
})
export class AvisoRascunho {
  readonly em = input.required<string>();
  readonly descartar = output<void>();
}
