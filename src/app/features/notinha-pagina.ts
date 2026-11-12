import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { NotinhaVenda } from '../core/models';
import { mensagemErro } from '../core/supabase';
import { LojaService } from '../core/loja.service';
import { NotinhaService } from '../core/notinha.service';
import { VendasService } from '../core/vendas.service';
import { SimulacaoNotinha } from '../shared/notinha-previa';
import { Icone } from '../shared/ui';
import { numeroCurto } from '../shared/notinha';

/** /notinha/:id — simulação de uma venda real, com Imprimir. */
@Component({
  selector: 'app-notinha-pagina',
  imports: [SimulacaoNotinha, Icone],
  template: `
    <main class="pagina">
      <header class="cabecalho">
        <div>
          <h1>Notinha</h1>
          <p class="muted small num">Venda nº {{ numero() }}</p>
        </div>
        <button type="button" class="btn sec pequeno" (click)="voltar()"><i-con nome="voltar" /> Voltar</button>
      </header>

      @if (erro()) {
        <p class="erro-msg">{{ erro() }}</p>
      } @else if (venda(); as v) {
        <app-simulacao-notinha [venda]="v" [loja]="loja.dados()" />
        <button type="button" class="btn bloco" (click)="notinha.imprimir(v)"><i-con nome="imprimir" /> Imprimir</button>
      } @else {
        <p class="vazio">Carregando…</p>
      }
    </main>
  `,
})
export class NotinhaPagina {
  readonly id = input.required<string>();
  protected notinha = inject(NotinhaService);
  protected loja = inject(LojaService);
  private vendas = inject(VendasService);
  private location = inject(Location);
  private router = inject(Router);
  protected venda = signal<NotinhaVenda | null>(null);
  protected erro = signal('');

  protected numero = () => numeroCurto(this.id());

  constructor() {
    effect(() => {
      // Reage também à fila: a venda offline que acabou de ser enviada deixa de ser "pendente"
      const id = this.id();
      this.vendas.fila();
      untracked(() => this.carregar(id));
    });
    this.loja.atualizar();
  }

  private async carregar(id: string) {
    try {
      const v = await this.notinha.buscar(id);
      if (id !== this.id()) return;
      if (v) {
        this.erro.set('');
        this.venda.set(v);
      } else this.erro.set('Venda não encontrada.');
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  protected voltar() {
    if (history.length > 1) this.location.back();
    else this.router.navigateByUrl('/');
  }
}
