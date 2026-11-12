import { Component, computed, input } from '@angular/core';
import { DadosLoja, NotinhaVenda, PAGAMENTOS } from '../core/models';
import { encode } from 'uqr';
import { BrlPipe } from './ui';

/**
 * Número do WhatsApp a partir do telefone da loja: só celular brasileiro com DDD
 * (11 dígitos, o terceiro é 9). Telefone fixo ou vazio: sem QR.
 */
export function whatsappDe(telefone: string): string | null {
  let d = telefone.replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 12 && d.startsWith('0')) d = d.slice(1);
  return /^[1-9]{2}9\d{8}$/.test(d) ? '55' + d : null;
}

const dataCompleta = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

const COD_00_00 = /^\d{2}-\d{2}$/;

interface GrupoNotinha {
  tipo: string;
  produtos: { codigo: string | null; nome: string; itens: { detalhe: string; quantidade: number; preco_unitario: number }[] }[];
}

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
      <!-- Com WhatsApp: texto à esquerda (mesmo eixo do resto da notinha) e o QR ao lado do número -->
      <header class="nt-loja" [class.nt-loja-qr]="qr()">
        <div class="nt-loja-texto">
          <p class="nt-nome">{{ loja().nome }}</p>
          @if (loja().endereco) {
            <p class="nt-endereco">
              @if (qr()) {
                @for (linha of enderecoLinhas(); track $index) {
                  <span class="nt-end-linha">{{ linha }}</span>
                }
              } @else {
                @for (parte of enderecoPartes(); track $index) {
                  <span class="nt-junto">{{ parte }}</span>{{ ' ' }}
                }
              }
            </p>
          }
          @if (loja().telefone) {
            <p class="nt-fone">
              @if (qr()) {
                <span>WhatsApp</span>{{ ' ' }}
              }
              <b class="nt-num">{{ loja().telefone }}</b>
            </p>
          }
        </div>
        @if (qr(); as q) {
          <svg class="nt-qr" [attr.viewBox]="'0 0 ' + q.tamanho + ' ' + q.tamanho" shape-rendering="crispEdges" role="img" aria-label="QR code do WhatsApp da loja">
            <path [attr.d]="q.d" />
          </svg>
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
      </dl>

      <hr class="nt-sep" />
      <div class="nt-itens">
        @for (g of grupos(); track $index) {
          <section class="nt-grupo">
            @if (g.tipo) {
              <p class="nt-tipo">{{ g.tipo }}</p>
            }
            <ul>
              @for (p of g.produtos; track $index) {
                <li>
                  <p class="nt-produto">
                    @if (p.codigo) {
                      <b class="nt-cod">{{ p.codigo }}</b>
                    }
                    {{ p.nome }}
                  </p>
                  @for (i of p.itens; track $index) {
                    <div class="nt-linha-item">
                      @if (i.detalhe) {
                        <p class="nt-var">{{ i.detalhe }}</p>
                      }
                      <p class="nt-conta">
                        <span class="nt-num">{{ i.quantidade }} × {{ i.preco_unitario | brl }}</span>
                        <span class="nt-num">{{ i.quantidade * i.preco_unitario | brl }}</span>
                      </p>
                    </div>
                  }
                </li>
              }
            </ul>
          </section>
        }
      </div>

      <hr class="nt-sep" />
      <p class="nt-total"><span>TOTAL</span><span class="nt-num">{{ venda().total | brl }}</span></p>
      <p class="nt-linha"><span>Pagamento</span><span>{{ pagamento() }}</span></p>
      <p class="nt-linha"><span>Itens</span><span class="nt-num">{{ unidades() }}</span></p>

      @if (venda().cancelada) {
        <p class="nt-marca">CANCELADA</p>
      }

      @if (loja().rodape) {
        <hr class="nt-sep" />
        <footer class="nt-rodape">
          <p>{{ loja().rodape }}</p>
        </footer>
      }
      <hr class="nt-sep" />
      <p class="nt-fiscal">NÃO É DOCUMENTO FISCAL</p>
    </article>
  `,
})
export class Notinha {
  readonly venda = input.required<NotinhaVenda>();
  readonly loja = input.required<DadosLoja>();

  /**
   * Endereço em pedaços separados pelas vírgulas, sem separar a vírgula do número
   * que vem depois ("Rua X, 245 - Centro," "Uberlândia - MG, 38400-104"):
   * a linha só quebra entre esses pedaços, nunca no meio deles.
   */
  /**
   * Na coluna ao lado do QR o endereço sai como em envelope: rua e número,
   * bairro e cidade, CEP ("Rua X, 221 - Centro, Uberlândia - MG, 38400-104").
   * Quebra no " - " logo depois do número e na vírgula antes do CEP; o traço e
   * a vírgula somem, porque a própria linha já separa.
   */
  protected enderecoLinhas = computed(() =>
    this.loja()
      .endereco.split(/(?<=\d)\s+-\s+|,\s*(?=\d{5}-?\d{3}\b)/)
      .map((l) => l.trim())
      .filter(Boolean),
  );

  protected enderecoPartes = computed(() =>
    this.loja()
      .endereco.split(/(?<=,)\s+(?!\d)/)
      .filter(Boolean),
  );

  /**
   * Itens agrupados pelo tipo (o nome do produto muitas vezes é só o modelo:
   * "Tampa Samsung" › "Tampa A02") e, dentro do tipo, pelo produto: as cores e
   * qualidades do mesmo produto saem embaixo de um nome só.
   * O 00-00 é do produto e fica no nome; o código de barras é de cada variação
   * e fica na linha dela. "Padrão" não diz nada ao cliente e não sai.
   */
  protected grupos = computed(() => {
    const grupos: GrupoNotinha[] = [];
    for (const i of this.venda().itens) {
      const tipo = i.tipo?.trim() ?? '';
      const codigo = i.codigo && COD_00_00.test(i.codigo) ? i.codigo : null;
      const barras = i.codigo && !codigo ? i.codigo : null;
      let g = grupos.find((x) => x.tipo === tipo);
      if (!g) grupos.push((g = { tipo, produtos: [] }));
      let p = g.produtos.find((x) => x.codigo === codigo && x.nome === i.nome);
      if (!p) g.produtos.push((p = { codigo, nome: i.nome, itens: [] }));
      const variacao = /^padr[aã]o$/i.test(i.variacao.trim()) ? '' : i.variacao.trim();
      p.itens.push({ detalhe: [variacao, barras].filter(Boolean).join(' · '), quantidade: i.quantidade, preco_unitario: i.preco_unitario });
    }
    // Itens sem tipo conhecido (venda antiga do aparelho) vão para o fim, sem título
    return [...grupos.filter((g) => g.tipo), ...grupos.filter((g) => !g.tipo)];
  });

  /** QR que abre a conversa no WhatsApp da loja (gerado aqui, funciona sem internet). */
  protected qr = computed(() => {
    const numero = whatsappDe(this.loja().telefone);
    if (!numero) return null;
    const { data, size } = encode(`https://wa.me/${numero}`, { ecc: 'M', border: 0 });
    let d = '';
    data.forEach((linha, y) => linha.forEach((preto, x) => preto && (d += `M${x} ${y}h1v1h-1z`)));
    return { tamanho: size, d };
  });

  protected numero = computed(() => numeroCurto(this.venda().id));
  protected data = computed(() => dataCompleta.format(new Date(this.venda().criada_em)).replace(',', ''));
  protected pagamento = computed(() => PAGAMENTOS[this.venda().pagamento]);
  protected unidades = computed(() => {
    const u = this.venda().itens.reduce((s, i) => s + i.quantidade, 0);
    return `${u} ${u === 1 ? 'unidade' : 'unidades'}`;
  });
}
