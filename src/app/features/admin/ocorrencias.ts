import { Component, inject, signal } from '@angular/core';
import { supabase, mensagemErro } from '../../core/supabase';
import { DataHoraPipe, Ident, Toast } from '../../shared/ui';

interface Ocorrencia {
  id: string;
  tipo: string;
  mensagem: string;
  resolvida: boolean;
  criado_em: string;
  resolvida_em: string | null;
  usuario: { nome: string } | null;
  dados: {
    cliente?: string;
    tipo_preco?: string;
    pagamento?: string;
    criada_em?: string;
    faltando?: { codigo?: string | null; codigo_barras?: string | null; produto?: string; variacao?: string; pedido?: number; disponivel?: number; erro?: string }[];
  };
}

@Component({
  selector: 'app-ocorrencias',
  imports: [DataHoraPipe, Ident],
  template: `
    <main class="pagina">
      <header class="cabecalho"><h1>Ocorrências</h1></header>
      <p class="muted small">Vendas que o servidor recusou por falta de estoque, normalmente feitas sem internet ao mesmo tempo por dois vendedores. Confira com o vendedor e resolva com o cliente.</p>

      <div class="segmento" role="group" aria-label="Situação">
        <button [attr.aria-pressed]="!resolvidas()" (click)="ver(false)">Abertas</button>
        <button [attr.aria-pressed]="resolvidas()" (click)="ver(true)">Resolvidas</button>
      </div>

      @if (erro()) {
        <p class="erro-msg">{{ erro() }}</p>
      }

      <ul class="lista">
        @for (o of lista(); track o.id) {
          <li class="oc">
            <strong>{{ o.mensagem }}</strong>
            <p class="small">
              Vendedor <strong>{{ o.usuario?.nome }}</strong> · cliente <strong>{{ o.dados.cliente }}</strong><br />
              <span class="muted">Venda feita em {{ o.dados.criada_em | dataHora }}, recusada em {{ o.criado_em | dataHora }}</span>
            </p>
            <ul class="faltas">
              @for (f of o.dados.faltando ?? []; track $index) {
                @if (f.erro) {
                  <li>Item removido do catálogo</li>
                } @else {
                  <li><app-ident [codigo]="f.codigo" [barras]="f.codigo_barras" /> <span><span class="clamp-2">{{ f.produto }} · {{ f.variacao }}</span><span class="small muted">Pediu {{ f.pedido }}, havia {{ f.disponivel }}</span></span></li>
                }
              }
            </ul>
            @if (!o.resolvida) {
              <button class="btn sec pequeno" (click)="resolver(o)">Marcar como resolvida</button>
            } @else {
              <span class="selo ok">Resolvida em {{ o.resolvida_em | dataHora }}</span>
            }
          </li>
        } @empty {
          <li class="vazio">{{ resolvidas() ? 'Nenhuma ocorrência resolvida.' : 'Nenhuma ocorrência aberta.' }}</li>
        }
      </ul>
    </main>
  `,
  styles: `
    .oc { display: grid; gap: .5rem; padding: .9rem 1rem; justify-items: start; }
    .faltas { margin: 0; padding: 0; list-style: none; font-size: .9rem; display: grid; gap: .5rem; width: 100%; }
    .faltas li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .5rem; align-items: start; }
    .faltas li > span:last-child { display: grid; }
  `,
})
export class Ocorrencias {
  private toast = inject(Toast);
  protected resolvidas = signal(false);
  protected lista = signal<Ocorrencia[]>([]);
  protected erro = signal('');

  constructor() {
    this.carregar();
  }

  protected ver(r: boolean) {
    this.resolvidas.set(r);
    this.carregar();
  }

  private async carregar() {
    const { data, error } = await supabase
      .from('ocorrencias')
      .select('id, tipo, mensagem, resolvida, criado_em, resolvida_em, dados, usuario:perfis!ocorrencias_usuario_id_fkey(nome)')
      .eq('resolvida', this.resolvidas())
      .order('criado_em', { ascending: false })
      .limit(100);
    if (error) return this.erro.set(mensagemErro(error));
    this.lista.set(data as unknown as Ocorrencia[]);
  }

  protected async resolver(o: Ocorrencia) {
    const { error } = await supabase.rpc('resolver_ocorrencia', { p_id: o.id });
    if (error) return this.toast.mostrar(mensagemErro(error), 'erro');
    this.toast.mostrar('Ocorrência resolvida', 'ok');
    this.carregar();
  }
}
