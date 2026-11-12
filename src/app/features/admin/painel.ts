import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { supabase, mensagemErro } from '../../core/supabase';
import { PAGAMENTOS, SELECT_VENDA, VendaLinha } from '../../core/models';
import { BrlPipe, Ident, Icone, IntPipe, Toast, baixarCsv } from '../../shared/ui';
import { Ajuda } from '../../shared/ajuda';

interface Resumo {
  faturamento: number;
  vendas: number;
  itens: number;
  ticket_medio: number;
  lucro_estimado: number;
  itens_sem_custo: number;
  por_dia: { dia: string; total: number; vendas: number }[];
  por_vendedor: { nome: string; total: number; vendas: number }[];
  por_pagamento: Partial<Record<keyof typeof PAGAMENTOS, number>>;
  por_tipo_preco: { atacado?: number; varejo?: number };
  mais_vendidos: { codigo: string | null; codigo_barras?: string | null; produto: string; variacao: string; quantidade: number; total: number }[];
  estoque_baixo: { codigo: string | null; codigo_barras?: string | null; produto: string; variacao: string; estoque: number; minimo: number }[];
  valor_estoque: { custo: number; varejo: number };
  ocorrencias_abertas: number;
}

type Periodo = 'hoje' | '7d' | '30d' | 'mes' | 'mes_ant';

/** Início do dia em São Paulo (UTC-3, sem horário de verão desde 2019). */
function inicioDiaSP(d: Date) {
  const sp = new Date(d.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 3));
}

function intervalo(p: Periodo): [Date, Date] {
  const hoje = inicioDiaSP(new Date());
  const amanha = new Date(hoje.getTime() + 86400_000);
  const dia = 86400_000;
  switch (p) {
    case 'hoje':
      return [hoje, amanha];
    case '7d':
      return [new Date(hoje.getTime() - 6 * dia), amanha];
    case '30d':
      return [new Date(hoje.getTime() - 29 * dia), amanha];
    case 'mes': {
      const sp = new Date(hoje.getTime() - 3 * 3600_000);
      return [new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), 1, 3)), amanha];
    }
    case 'mes_ant': {
      const sp = new Date(hoje.getTime() - 3 * 3600_000);
      return [
        new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth() - 1, 1, 3)),
        new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), 1, 3)),
      ];
    }
  }
}

@Component({
  selector: 'app-painel',
  imports: [BrlPipe, Ident, IntPipe, RouterLink, Icone, Ajuda],
  template: `
    <main class="pagina">
      <header class="cabecalho">
        <h1>Painel</h1>
        <button class="btn sec pequeno" (click)="exportar()" [disabled]="exportando()"><i-con nome="baixar" /> <span class="rotulo-opcional">Excel</span></button>
      </header>

      <div class="rolagem-x" role="group" aria-label="Período">
        @for (p of periodos; track p.id) {
          <button class="chip" [attr.aria-pressed]="periodo() === p.id" (click)="mudar(p.id)">{{ p.nome }}</button>
        }
      </div>

      @if (erro()) {
        <p class="erro-msg">{{ erro() }}</p>
      }

      @if (r(); as r) {
        @if (r.ocorrencias_abertas > 0) {
          <a class="ocorrencia" routerLink="/admin/ocorrencias">
            <i-con nome="alerta" />
            <span><strong>{{ r.ocorrencias_abertas }} {{ r.ocorrencias_abertas === 1 ? 'venda recusada' : 'vendas recusadas' }} para revisar</strong><br /><span class="small">Faltou estoque ao sincronizar</span></span>
          </a>
        }

        <section class="destaque">
          <span class="muted small">Faturamento</span>
          <strong class="valor num">{{ r.faturamento | brl }}</strong>
          <div class="mini">
            <div><span class="num">{{ r.vendas | int }}</span><span class="muted small">vendas</span></div>
            <div><span class="num">{{ r.itens | int }}</span><span class="muted small">itens</span></div>
            <div><span class="num">{{ r.ticket_medio | brl }}</span><span class="muted small">ticket médio</span></div>
            <div>
              <span class="num">{{ r.lucro_estimado | brl }}</span>
              <span class="muted small rotulo-ajuda">lucro estimado<app-ajuda sobre="Lucro estimado" texto="Faturamento menos o custo cadastrado dos itens vendidos; itens sem custo ficam de fora da conta." /></span>
            </div>
          </div>
          @if (r.itens_sem_custo > 0) {
            <p class="muted small nota">{{ r.itens_sem_custo | int }} {{ r.itens_sem_custo === 1 ? 'item vendido sem custo cadastrado ficou' : 'itens vendidos sem custo cadastrado ficaram' }} fora do lucro.</p>
          }
        </section>

        @if (r.por_dia.length > 1) {
          <section class="painel">
            <h2>Faturamento por dia</h2>
            <div class="grafico" role="group" [attr.aria-label]="'Faturamento diário, máximo ' + (maxDia() | brl)">
              @for (d of r.por_dia; track d.dia) {
                <button type="button" class="col" [attr.aria-label]="rotuloDia(d.dia) + ': ' + (d.total | brl) + ', ' + d.vendas + ' vendas'">
                  <span class="barra" [style.height.%]="(d.total / maxDia()) * 100"></span>
                  <span class="dica" aria-hidden="true"><strong>{{ d.total | brl }}</strong><br />{{ rotuloDia(d.dia) }} · {{ d.vendas }} venda(s)</span>
                </button>
              }
            </div>
            <div class="eixo muted small"><span>{{ rotuloDia(r.por_dia[0].dia) }}</span><span>{{ rotuloDia(r.por_dia[r.por_dia.length - 1].dia) }}</span></div>
          </section>
        }

        <div class="duas">
          <section class="painel">
            <h2>Por vendedor</h2>
            @for (v of r.por_vendedor; track v.nome) {
              <div class="linha-barra">
                <span class="uma-linha">{{ v.nome }} <span class="muted small">· {{ v.vendas | int }}</span></span>
                <strong class="num">{{ v.total | brl }}</strong>
                <div class="trilho"><div [style.width.%]="(v.total / r.faturamento) * 100"></div></div>
              </div>
            } @empty {
              <p class="muted small">Sem vendas no período.</p>
            }
          </section>

          <section class="painel">
            <h2>Recebimentos</h2>
            @for (p of pagamentos; track p) {
              <div class="linha-barra">
                <span>{{ nomesPag[p] }}</span>
                <strong class="num">{{ r.por_pagamento[p] ?? 0 | brl }}</strong>
                <div class="trilho"><div [style.width.%]="r.faturamento ? ((r.por_pagamento[p] ?? 0) / r.faturamento) * 100 : 0"></div></div>
              </div>
            }
            <p class="muted small sep">Atacado {{ r.por_tipo_preco.atacado ?? 0 | brl }} · Varejo {{ r.por_tipo_preco.varejo ?? 0 | brl }}</p>
          </section>
        </div>

        <section class="painel">
          <h2>Mais vendidos</h2>
          <ol class="ranking">
            @for (m of r.mais_vendidos; track (m.codigo ?? m.codigo_barras) + m.variacao + m.produto) {
              <li>
                <app-ident [codigo]="m.codigo" [barras]="m.codigo_barras" />
                <span class="nome"><span class="clamp-2">{{ m.produto }}</span><span class="muted small uma-linha">{{ m.variacao }}</span></span>
                <span class="num qtd-r">{{ m.quantidade | int }} un.</span>
              </li>
            } @empty {
              <p class="muted small">Sem vendas no período.</p>
            }
          </ol>
        </section>

        <section class="painel">
          <div class="titulo-acao">
            <h2>Estoque baixo</h2>
            <a routerLink="/admin/estoque" class="small">Ver estoque</a>
          </div>
          <ul class="ranking">
            @for (e of r.estoque_baixo; track (e.codigo ?? e.codigo_barras) + e.variacao + e.produto) {
              <li>
                <app-ident [codigo]="e.codigo" [barras]="e.codigo_barras" />
                <span class="nome"><span class="clamp-2">{{ e.produto }}</span><span class="muted small uma-linha">{{ e.variacao }}</span></span>
                <span class="selo" [class.perigo]="e.estoque <= 0" [class.alerta]="e.estoque > 0">{{ e.estoque }} / mín. {{ e.minimo }}</span>
              </li>
            } @empty {
              <p class="muted small">Nenhum item abaixo do mínimo.</p>
            }
          </ul>
        </section>

        <section class="painel valores">
          <div><span class="muted small">Estoque no custo</span><strong class="num">{{ r.valor_estoque.custo | brl }}</strong></div>
          <div><span class="muted small">Estoque no varejo</span><strong class="num">{{ r.valor_estoque.varejo | brl }}</strong></div>
        </section>
      } @else if (!erro()) {
        <p class="vazio">Carregando…</p>
      }
    </main>
  `,
  styles: `
    .ocorrencia { display: flex; gap: .7rem; align-items: center; padding: .85rem 1rem; border-radius: var(--r-md); background: var(--danger-bg); color: var(--danger); text-decoration: none; }
    .destaque { background: var(--ink); color: #fff; border-radius: var(--r-lg); padding: 1.1rem 1rem; display: grid; gap: .2rem; }
    .destaque .muted { color: #b9c2cf; }
    .destaque app-ajuda { --ajuda-cor: #fff; --ajuda-fundo: var(--ink); }
    .valor { font-size: clamp(1.7rem, 9vw, 2.4rem); font-weight: 800; font-stretch: 118%; line-height: 1.1; }
    .mini { display: grid; grid-template-columns: repeat(2, 1fr); gap: .75rem; margin-top: .9rem; padding-top: .9rem; border-top: 1px solid #2f3b4d; }
    .mini div { display: grid; }
    .mini .num { font-weight: 750; font-size: 1.1rem; }
    .nota { margin-top: .5rem; }
    @media (min-width: 600px) { .mini { grid-template-columns: repeat(4, 1fr); } }

    h2 { margin-bottom: .75rem; }
    .grafico { display: flex; align-items: flex-end; gap: 2px; height: 140px; border-bottom: 1px solid var(--line); }
    .col { flex: 1; min-width: 0; height: 100%; display: flex; align-items: flex-end; position: relative; padding: 0; border: 0; background: none; font: inherit; color: inherit; cursor: default; }
    .barra { display: block; width: 100%; min-height: 2px; background: var(--cobalt); border-radius: 4px 4px 0 0; }
    .col:hover .barra, .col:focus-visible .barra { background: var(--cobalt-press); }
    .col:focus-visible { outline-offset: 0; }
    .dica { display: none; position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); z-index: 3; white-space: nowrap; background: var(--ink); color: #fff; padding: .4rem .6rem; border-radius: 6px; font-size: .78rem; pointer-events: none; }
    .col:hover .dica, .col:focus .dica { display: block; }
    .titulo-acao a { display: inline-flex; align-items: center; min-height: 44px; padding-inline: .5rem; margin-right: -.5rem; }
    .col:first-child .dica { left: 0; transform: none; }
    .col:last-child .dica { left: auto; right: 0; transform: none; }
    .eixo { display: flex; justify-content: space-between; margin-top: .3rem; }

    .duas { display: grid; gap: 1rem; }
    @media (min-width: 640px) { .duas { grid-template-columns: 1fr 1fr; } }
    .linha-barra { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .25rem .5rem; margin-bottom: .7rem; }
    .trilho { grid-column: 1 / -1; height: 6px; background: var(--paper); border-radius: 3px; overflow: hidden; }
    .trilho div { height: 100%; background: var(--cobalt); border-radius: 3px; }
    .sep { padding-top: .5rem; border-top: 1px solid var(--line); }

    .ranking { list-style: none; margin: 0; padding: 0; display: grid; gap: .6rem; }
    .ranking li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .6rem; align-items: start; }
    .ranking app-ident { margin-top: .1rem; }
    /* código de barras no ranking: menor, para sobrar espaço para o nome em 320px */
    .ranking .barras-id { font-size: .68rem; padding-inline: .3em; }
    .ranking .nome { min-width: 0; display: grid; line-height: 1.3; }
    .ranking .qtd-r, .ranking .selo { margin-top: .1rem; }
    .titulo-acao { display: flex; justify-content: space-between; align-items: baseline; }
    .titulo-acao a { color: var(--cobalt); font-weight: 650; }
    .valores { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; }
    .valores div { display: grid; }
    .valores strong { font-size: 1.15rem; }
  `,
})
export class Painel {
  private toast = inject(Toast);
  protected periodos: { id: Periodo; nome: string }[] = [
    { id: 'hoje', nome: 'Hoje' },
    { id: '7d', nome: '7 dias' },
    { id: '30d', nome: '30 dias' },
    { id: 'mes', nome: 'Este mês' },
    { id: 'mes_ant', nome: 'Mês passado' },
  ];
  protected pagamentos = ['dinheiro', 'pix', 'cartao'] as const;
  protected nomesPag = PAGAMENTOS;
  protected periodo = signal<Periodo>('hoje');
  protected r = signal<Resumo | null>(null);
  protected erro = signal('');
  protected exportando = signal(false);
  protected maxDia = computed(() => Math.max(1, ...(this.r()?.por_dia.map((d) => Number(d.total)) ?? [1])));

  /** Período trocado antes de a resposta chegar: só a do período atual vale. */
  private consulta = 0;

  constructor() {
    this.carregar();
  }

  protected mudar(p: Periodo) {
    this.periodo.set(p);
    this.carregar();
  }

  protected rotuloDia(d: string) {
    const [, m, dia] = d.split('-');
    return `${dia}/${m}`;
  }

  private async carregar() {
    const vez = ++this.consulta;
    this.erro.set('');
    const [ini, fim] = intervalo(this.periodo());
    const { data, error } = await supabase.rpc('dashboard_resumo', { p_inicio: ini.toISOString(), p_fim: fim.toISOString() });
    if (vez !== this.consulta) return;
    if (error) return this.erro.set(mensagemErro(error));
    this.r.set(data as Resumo);
  }

  /** Exporta as vendas do período, uma linha por item, para abrir no Excel. */
  protected async exportar() {
    this.exportando.set(true);
    try {
      const [ini, fim] = intervalo(this.periodo());
      const todas: VendaLinha[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase
          .from('vendas')
          .select(SELECT_VENDA)
          .gte('criada_em', ini.toISOString())
          .lt('criada_em', fim.toISOString())
          .order('criada_em')
          .range(de, de + 999);
        if (error) throw error;
        todas.push(...(data as unknown as VendaLinha[]));
        if (data.length < 1000) break;
      }
      const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
      const linhas: (string | number)[][] = [
        ['Data', 'Venda', 'Status', 'Vendedor', 'Cliente', 'Tipo de preço', 'Pagamento', 'Código', 'Produto', 'Variação', 'Qtd', 'Preço un.', 'Subtotal'],
      ];
      for (const v of todas)
        for (const i of v.venda_itens)
          linhas.push([
            fmt.format(new Date(v.criada_em)),
            v.id.slice(0, 8),
            v.status === 'cancelada' ? 'Cancelada' : 'Concluída',
            v.vendedor?.nome ?? '',
            v.cliente_nome,
            v.tipo_preco === 'atacado' ? 'Atacado' : 'Varejo',
            PAGAMENTOS[v.forma_pagamento],
            i.variacoes.produtos.codigo ?? i.variacoes.codigo_barras ?? '',
            i.variacoes.produtos.nome,
            i.variacoes.nome,
            i.quantidade,
            Number(i.preco_unitario),
            Number(i.preco_unitario) * i.quantidade,
          ]);
      baixarCsv(`liang-vendas-${this.periodo()}-${new Date().toISOString().slice(0, 10)}.csv`, linhas);
    } catch (e) {
      this.toast.mostrar(mensagemErro(e), 'erro');
    } finally {
      this.exportando.set(false);
    }
  }
}
