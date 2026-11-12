import { Component, computed, input } from '@angular/core';
import { DadosLoja, NotinhaVenda, PAGAMENTOS } from '../core/models';
import { BrlPipe } from './ui';

const dataCompleta = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

/** Nº curto da venda: os 8 primeiros caracteres do id. */
export const numeroCurto = (id: string) => id.slice(0, 8).toUpperCase();

/**
 * A notinha (recibo) para a impressora térmica de 80 mm.
 * O MESMO componente e o MESMO CSS (src/notinha.scss) servem para a simulação
 * na tela e para o papel: o que aparece na tela é o que sai na impressora.
 * Sempre em português (é do cliente): `translate="no"` protege da tradução do app.
 */
@Component({
  selector: 'app-notinha',
  imports: [BrlPipe],
  host: { translate: 'no' },
  template: `
    <article class="notinha" [attr.aria-label]="'Notinha da venda ' + numero()">
      <header class="nt-loja">
        <p class="nt-nome">{{ loja().nome }}</p>
        @if (loja().cnpj) {
          <p>CNPJ {{ loja().cnpj }}</p>
        }
        @if (loja().endereco) {
          <p class="nt-endereco">{{ loja().endereco }}</p>
        }
        @if (loja().telefone) {
          <p>{{ loja().telefone }}</p>
        }
      </header>

      @if (venda().cancelada) {
        <p class="nt-marca">CANCELADA</p>
      }
      @if (venda().pendente) {
        <p class="nt-marca nt-pendente">Venda pendente de envio</p>
      }

      <hr class="nt-sep" />
      <dl class="nt-dados">
        <div><dt>Venda nº</dt><dd class="nt-num">{{ numero() }}</dd></div>
        <div><dt>Data</dt><dd class="nt-num">{{ data() }}</dd></div>
        <div><dt>Vendedor</dt><dd>{{ venda().vendedor || '—' }}</dd></div>
        <div><dt>Cliente</dt><dd>{{ venda().cliente }}</dd></div>
        <div><dt>Preço</dt><dd>{{ venda().tipo_preco === 'atacado' ? 'Atacado' : 'Varejo' }}</dd></div>
      </dl>

      <hr class="nt-sep" />
      <ul class="nt-itens">
        @for (i of venda().itens; track $index) {
          <li>
            <p class="nt-produto">
              @if (i.codigo) {
                <b class="nt-cod">{{ i.codigo }}</b>
              }
              {{ i.nome }}
            </p>
            <p class="nt-var">{{ i.variacao }}</p>
            <p class="nt-conta">
              <span class="nt-num">{{ i.quantidade }} × {{ i.preco_unitario | brl }}</span>
              <span class="nt-num">{{ i.quantidade * i.preco_unitario | brl }}</span>
            </p>
          </li>
        }
      </ul>

      <hr class="nt-sep" />
      <p class="nt-total"><span>TOTAL</span><span class="nt-num">{{ venda().total | brl }}</span></p>
      <p class="nt-linha"><span>Pagamento</span><span>{{ pagamento() }}</span></p>
      <p class="nt-linha"><span>Itens</span><span class="nt-num">{{ unidades() }}</span></p>

      @if (venda().cancelada) {
        <p class="nt-marca">CANCELADA</p>
      }

      <hr class="nt-sep" />
      <footer class="nt-rodape">
        @if (loja().rodape) {
          <p>{{ loja().rodape }}</p>
        }
        <p class="nt-fiscal">NÃO É DOCUMENTO FISCAL</p>
      </footer>
    </article>
  `,
})
export class Notinha {
  readonly venda = input.required<NotinhaVenda>();
  readonly loja = input.required<DadosLoja>();

  protected numero = computed(() => numeroCurto(this.venda().id));
  protected data = computed(() => dataCompleta.format(new Date(this.venda().criada_em)).replace(',', ''));
  protected pagamento = computed(() => PAGAMENTOS[this.venda().pagamento]);
  protected unidades = computed(() => {
    const u = this.venda().itens.reduce((s, i) => s + i.quantidade, 0);
    return `${u} ${u === 1 ? 'unidade' : 'unidades'}`;
  });
}
