import { Component, ElementRef, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { VendasService } from '../core/vendas.service';
import { NotinhaService, notinhaDeLinha } from '../core/notinha.service';
import { PAGAMENTOS, SELECT_VENDA, VendaLinha, VendaPendente } from '../core/models';
import { supabase, mensagemErro } from '../core/supabase';
import { NOME_MOV, codigoMov, codigoVenda, faixaUuid, lerCodigo, prefixoUuid } from '../core/codigo';
import { BrlPipe, DataHoraPipe, Ident, Icone } from '../shared/ui';

interface VendaConsulta extends VendaLinha {
  estoque_devolvido: boolean | null;
  cancelada_em: string | null;
  cancelador: { nome: string } | null;
}

interface MovConsulta {
  id: number;
  tipo: string;
  quantidade: number;
  saldo_apos: number;
  custo_unitario: number | null;
  motivo: string | null;
  criado_em: string;
  venda_id: string | null;
  perfis: { nome: string } | null;
  variacoes: { nome: string; codigo_barras: string | null; produtos: { codigo: string | null; nome: string } };
}

interface OcorrenciaConsulta {
  id: string;
  mensagem: string;
  resolvida: boolean;
  criado_em: string;
  resolvida_em: string | null;
  usuario: { nome: string } | null;
  dados: { venda_id?: string; cliente?: string; criada_em?: string };
}

interface Resultado {
  codigo: string;
  vendas: VendaConsulta[];
  /** Vendas feitas sem internet que ainda estão neste aparelho. */
  pendentes: VendaPendente[];
  ocorrencias: OcorrenciaConsulta[];
  movimentos: MovConsulta[];
  /** Movimentações de estoque de cada venda encontrada (venda e cancelamento). Só admin. */
  movsDaVenda: Record<string, MovConsulta[]>;
}

const SELECT_CONSULTA = `${SELECT_VENDA}, cancelada_em, cancelador:perfis!vendas_cancelada_por_fkey(nome)`;
const SELECT_MOV = 'id, tipo, quantidade, saldo_apos, custo_unitario, motivo, criado_em, venda_id, perfis(nome), variacoes(nome, codigo_barras, produtos(codigo, nome))';

/**
 * Consulta pelo número do registro: venda (o "Venda nº" da notinha, que também
 * serve para o cancelamento e para a venda recusada) ou movimentação (M1542).
 * Admin vê tudo; vendedor encontra só as próprias vendas (a RLS garante).
 */
@Component({
  selector: 'app-consultar',
  imports: [FormsModule, RouterLink, BrlPipe, DataHoraPipe, Ident, Icone],
  template: `
    <main class="pagina">
      <header class="cabecalho">
        <button type="button" class="btn-icone" (click)="voltar()" aria-label="Voltar"><i-con nome="voltar" /></button>
        <h1 class="titulo">Consultar código</h1>
      </header>

      <form class="busca painel" (submit)="$event.preventDefault(); consultar()">
        <label for="codigo-consulta" class="rotulo">Número do registro</label>
        <div class="linha">
          <input #campo id="codigo-consulta" class="input num" [ngModel]="termo()" (ngModelChange)="termo.set($event)" name="codigo"
            autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="search" maxlength="40"
            [placeholder]="auth.isAdmin() ? 'C0A1B2C3 ou M1542' : 'C0A1B2C3'" aria-describedby="codigo-dica" />
          <button class="btn" type="submit" [disabled]="!termo().trim() || buscando()">Consultar</button>
        </div>
        <p id="codigo-dica" class="muted small">
          @if (auth.isAdmin()) {
            Venda nº da notinha (vale também para o cancelamento e para venda recusada) ou movimentação de estoque, como M1542.
          } @else {
            Venda nº impresso na notinha. Você encontra só as suas vendas.
          }
        </p>
      </form>

      @if (erro()) {
        <p class="erro-msg" role="alert">{{ erro() }}</p>
      }
      @if (buscando()) {
        <p class="muted" role="status">Procurando…</p>
      }

      @if (resultado(); as r) {
        <div class="resultados" aria-live="polite">
          @if (!total(r)) {
            <p class="vazio">Nenhum registro com o código <strong class="num">{{ r.codigo }}</strong>.</p>
          }

          @for (v of r.pendentes; track v.id) {
            <article class="card">
              <p class="selos"><span class="selo num">Venda nº {{ cod(v.id) }}</span><span class="selo alerta">Neste aparelho, aguardando envio</span></p>
              <div class="topo"><strong class="clamp-2">{{ v.cliente }}</strong><strong class="num">{{ v.total_previsto | brl }}</strong></div>
              <span class="muted small">{{ v.criada_em | dataHora }} · {{ v.vendedor_nome }} · {{ v.tipo_preco === 'atacado' ? 'Atacado' : 'Varejo' }} · {{ pag[v.pagamento] }}</span>
              <ul class="itens">
                @for (i of v.itens; track $index) {
                  <li><span class="num">{{ i.quantidade }}×</span> <span class="clamp-2">{{ i.codigo }} {{ i.nome }}</span></li>
                }
              </ul>
              <button type="button" class="btn sec pequeno" (click)="notinha.abrir(notinha.dePendente(v, true))"><i-con nome="imprimir" /> Ver notinha</button>
            </article>
          }

          @for (v of r.vendas; track v.id) {
            <article class="card" [class.cancelada]="v.status === 'cancelada'">
              <p class="selos">
                <span class="selo num">Venda nº {{ cod(v.id) }}</span>
                @if (v.status === 'cancelada') {
                  <span class="selo perigo">Cancelada</span>
                } @else {
                  <span class="selo ok">Concluída</span>
                }
              </p>
              <div class="topo"><strong class="clamp-2">{{ v.cliente_nome }}</strong><strong class="num valor">{{ v.total | brl }}</strong></div>
              <span class="muted small">
                {{ v.criada_em | dataHora }} · {{ v.vendedor?.nome }} · {{ v.tipo_preco === 'atacado' ? 'Atacado' : 'Varejo' }} · {{ pag[v.forma_pagamento] }}
                @if (v.offline) { · feita sem internet }
              </span>
              <ul class="itens">
                @for (i of v.venda_itens; track $index) {
                  <li><span class="num">{{ i.quantidade }}×</span> <span class="clamp-2">{{ i.variacoes.produtos.codigo || i.variacoes.codigo_barras }} {{ i.variacoes.produtos.nome }} · {{ i.variacoes.nome }}</span> <span class="muted num">{{ i.preco_unitario | brl }}</span></li>
                }
              </ul>
              @if (v.status === 'cancelada') {
                <div class="bloco-cancel">
                  <strong>Cancelamento</strong>
                  <span class="small">{{ v.cancelada_em | dataHora }}@if (v.cancelador) { · por {{ v.cancelador.nome }} }</span>
                  <span class="small">Motivo: {{ v.motivo_cancelamento }}</span>
                  <span class="small">Estoque {{ v.estoque_devolvido ? 'devolvido' : 'não devolvido' }}</span>
                </div>
              }
              @if (r.movsDaVenda[v.id]?.length) {
                <div class="movs-venda">
                  <span class="muted small">Movimentações de estoque</span>
                  <ul>
                    @for (m of r.movsDaVenda[v.id]; track m.id) {
                      <li class="small">
                        <button type="button" class="link num" (click)="abrirCodigo(codMov(m.id))">{{ codMov(m.id) }}</button>
                        <span>{{ nomeMov[m.tipo] }}</span>
                        <span class="uma-linha">{{ m.variacoes.produtos.nome }} · {{ m.variacoes.nome }}</span>
                        <span class="num" [class.pos]="m.quantidade > 0" [class.neg]="m.quantidade < 0">{{ m.quantidade > 0 ? '+' : '' }}{{ m.quantidade }}</span>
                      </li>
                    }
                  </ul>
                </div>
              }
              <button type="button" class="btn sec pequeno" (click)="notinha.abrir(deLinha(v))"><i-con nome="imprimir" /> Ver notinha</button>
            </article>
          }

          @for (o of r.ocorrencias; track o.id) {
            <article class="card">
              <p class="selos">
                <span class="selo num">Venda nº {{ cod(o.dados.venda_id ?? '') }}</span>
                <span class="selo perigo">Recusada</span>
                @if (o.resolvida) {
                  <span class="selo ok">Ocorrência resolvida</span>
                } @else {
                  <span class="selo alerta">Ocorrência aberta</span>
                }
              </p>
              <strong>{{ o.mensagem }}</strong>
              <span class="small">Vendedor <strong>{{ o.usuario?.nome }}</strong> · cliente <strong>{{ o.dados.cliente }}</strong></span>
              <span class="muted small">Venda feita em {{ o.dados.criada_em | dataHora }}, recusada em {{ o.criado_em | dataHora }}@if (o.resolvida_em) {, resolvida em {{ o.resolvida_em | dataHora }}}</span>
              <a class="btn sec pequeno" routerLink="/admin/ocorrencias">Abrir Ocorrências</a>
            </article>
          }

          @for (m of r.movimentos; track m.id) {
            <article class="card">
              <p class="selos"><span class="selo num">Movimentação {{ codMov(m.id) }}</span><span class="selo tipo-mov" [attr.data-tipo]="m.tipo">{{ nomeMov[m.tipo] }}</span></p>
              <div class="mov">
                <app-ident [codigo]="m.variacoes.produtos.codigo" [barras]="m.variacoes.codigo_barras" />
                <span class="desc"><strong class="clamp-2">{{ m.variacoes.produtos.nome }}</strong><span class="muted small uma-linha">{{ m.variacoes.nome }}</span></span>
                <span class="qtd">
                  <span class="num" [class.pos]="m.quantidade > 0" [class.neg]="m.quantidade < 0">{{ m.quantidade > 0 ? '+' : '' }}{{ m.quantidade }}</span>
                  <span class="muted small num">saldo {{ m.saldo_apos }}</span>
                </span>
              </div>
              <span class="muted small">{{ m.criado_em | dataHora }} · {{ m.perfis?.nome }}@if (m.custo_unitario !== null) { · custo {{ m.custo_unitario | brl }} un. }</span>
              @if (m.motivo) {
                <p class="motivo small">{{ m.motivo }}</p>
              }
              @if (m.venda_id) {
                <button type="button" class="btn sec pequeno" (click)="abrirCodigo(cod(m.venda_id))">Ver venda nº {{ cod(m.venda_id) }}</button>
              }
            </article>
          }
        </div>
      }
    </main>
  `,
  styles: `
    .titulo { flex: 1; min-width: 0; font-size: 1.3rem; }
    .busca { display: grid; gap: .5rem; }
    .rotulo { font-weight: 650; font-size: .9rem; }
    .linha { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .5rem; }
    .linha .input { font-size: 1.25rem; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }
    .linha .input::placeholder { text-transform: none; letter-spacing: .02em; font-weight: 500; }
    .resultados { display: grid; gap: .75rem; }
    .card { display: grid; gap: .35rem; padding: .9rem 1rem; background: var(--surface); border-radius: var(--r-lg); min-width: 0; }
    .card > .btn { justify-self: start; margin-top: .3rem; }
    .selos { display: flex; flex-wrap: wrap; gap: .3rem; margin: 0 0 .15rem; }
    .topo { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem; align-items: start; }
    .cancelada .valor { text-decoration: line-through; color: var(--muted); }
    .itens { margin: .2rem 0 0; padding: 0; list-style: none; font-size: .88rem; display: grid; gap: .2rem; }
    .itens li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .4rem; }
    .bloco-cancel { display: grid; gap: .1rem; padding: .55rem .7rem; border-radius: var(--r-sm); background: var(--danger-bg); color: var(--danger); }
    .movs-venda { display: grid; gap: .25rem; padding-top: .4rem; border-top: 1px solid var(--line); }
    .movs-venda ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .2rem; }
    .movs-venda li { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; gap: .45rem; align-items: baseline; }
    .link { border: 0; background: none; padding: 0; font: inherit; font-weight: 700; color: var(--cobalt); text-decoration: underline; cursor: pointer; min-height: 24px; }
    .mov { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .65rem; align-items: start; }
    .mov app-ident { margin-top: .1rem; }
    .desc { display: grid; min-width: 0; line-height: 1.3; }
    .qtd { display: grid; justify-items: end; line-height: 1.2; }
    .qtd .num:first-child { font-weight: 800; font-size: 1.15rem; }
    .pos { color: var(--ok); }
    .neg { color: var(--danger); }
    .motivo { margin: 0; padding: .4rem .6rem; background: var(--paper); border-radius: var(--r-sm); }
  `,
})
export class Consultar {
  protected auth = inject(AuthService);
  protected notinha = inject(NotinhaService);
  private vendasSrv = inject(VendasService);
  private router = inject(Router);
  /** Código na URL (?codigo=C0A1B2C3): o voltar e os links internos funcionam. */
  readonly codigoParam = input<string | undefined>(undefined, { alias: 'codigo' });

  protected termo = signal('');
  protected buscando = signal(false);
  protected erro = signal('');
  protected resultado = signal<Resultado | null>(null);
  protected readonly pag = PAGAMENTOS;
  protected readonly nomeMov = NOME_MOV;
  protected readonly cod = codigoVenda;
  protected readonly codMov = codigoMov;
  protected readonly deLinha = notinhaDeLinha;
  private campo = viewChild.required<ElementRef<HTMLInputElement>>('campo');
  private vez = 0;

  constructor() {
    effect(() => {
      const c = this.codigoParam()?.trim();
      untracked(() => {
        if (c) {
          this.termo.set(c);
          this.buscar(c);
        } else {
          this.resultado.set(null);
          setTimeout(() => this.campo().nativeElement.focus());
        }
      });
    });
  }

  protected total(r: Resultado) {
    return r.vendas.length + r.pendentes.length + r.ocorrencias.length + r.movimentos.length;
  }

  protected consultar() {
    const c = this.termo().trim();
    if (!c) return;
    if (c === this.codigoParam()?.trim()) this.buscar(c);
    else this.abrirCodigo(c);
  }

  protected abrirCodigo(c: string) {
    this.router.navigate([], { queryParams: { codigo: c } });
  }

  protected voltar() {
    if (history.length > 1) history.back();
    else this.router.navigate([this.auth.isAdmin() ? '/admin/mais' : '/minhas-vendas']);
  }

  private async buscar(texto: string) {
    const { venda, mov } = lerCodigo(texto);
    this.erro.set('');
    if (!venda && mov === null) {
      this.resultado.set(null);
      return this.erro.set(
        this.auth.isAdmin()
          ? 'Código inválido. Use o número da venda (8 letras e números, como C0A1B2C3) ou da movimentação (como M1542).'
          : 'Código inválido. Use o número da venda impresso na notinha (8 letras e números, como C0A1B2C3).',
      );
    }
    const vez = ++this.vez;
    const admin = this.auth.isAdmin();
    this.buscando.set(true);
    try {
      const r: Resultado = { codigo: texto.trim().toUpperCase(), vendas: [], pendentes: [], ocorrencias: [], movimentos: [], movsDaVenda: {} };
      const tarefas: Promise<void>[] = [];
      if (venda) {
        const [de, ate] = faixaUuid(venda);
        r.pendentes = this.vendasSrv.fila().filter((v) => v.id.replace(/-/g, '').startsWith(venda));
        tarefas.push(
          (async () => {
            const { data, error } = await supabase.from('vendas').select(SELECT_CONSULTA).gte('id', de).lte('id', ate).order('criada_em', { ascending: false }).limit(10);
            if (error) throw error;
            r.vendas = data as unknown as VendaConsulta[];
            if (admin && r.vendas.length) {
              const m = await supabase.from('movimentos').select(SELECT_MOV).in('venda_id', r.vendas.map((v) => v.id)).order('criado_em');
              if (m.error) throw m.error;
              for (const x of m.data as unknown as MovConsulta[]) (r.movsDaVenda[x.venda_id!] ??= []).push(x);
            }
          })(),
        );
        if (admin) {
          tarefas.push(
            (async () => {
              const { data, error } = await supabase
                .from('ocorrencias')
                .select('id, mensagem, resolvida, criado_em, resolvida_em, dados, usuario:perfis!ocorrencias_usuario_id_fkey(nome)')
                .like('dados->>venda_id', `${prefixoUuid(venda)}%`)
                .order('criado_em', { ascending: false })
                .limit(10);
              if (error) throw error;
              r.ocorrencias = data as unknown as OcorrenciaConsulta[];
            })(),
          );
        }
      }
      if (admin && mov !== null) {
        tarefas.push(
          (async () => {
            const { data, error } = await supabase.from('movimentos').select(SELECT_MOV).eq('id', mov).limit(1);
            if (error) throw error;
            r.movimentos = data as unknown as MovConsulta[];
          })(),
        );
      }
      await Promise.all(tarefas);
      if (vez !== this.vez) return;
      // Venda que já chegou ao servidor não aparece também como "neste aparelho"
      r.pendentes = r.pendentes.filter((p) => !r.vendas.some((v) => v.id === p.id));
      this.resultado.set(r);
    } catch (e) {
      if (vez === this.vez) this.erro.set(mensagemErro(e));
    } finally {
      if (vez === this.vez) this.buscando.set(false);
    }
  }
}
