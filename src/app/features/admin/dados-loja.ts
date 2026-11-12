import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { AtualizacaoService } from '../../core/atualizacao.service';
import { LojaService } from '../../core/loja.service';
import { DadosLoja, NotinhaVenda } from '../../core/models';
import { mensagemErro } from '../../core/supabase';
import { SimulacaoNotinha } from '../../shared/notinha-previa';
import { Rascunho, RascunhoService } from '../../core/rascunho.service';
import { AvisoRascunho } from '../../shared/aviso-rascunho';
import { Toast } from '../../shared/ui';

/** Mais › Dados da loja: cabeçalho e rodapé da notinha, com a simulação ao lado. */
@Component({
  selector: 'app-dados-loja',
  imports: [FormsModule, SimulacaoNotinha, AvisoRascunho],
  template: `
    <main class="pagina larga">
      <header class="cabecalho">
        <div>
          <h1>Dados da loja</h1>
          <p class="muted small">Cabeçalho e rodapé da notinha</p>
        </div>
      </header>

      @if (guardado.recuperado(); as em) {
        <app-aviso-rascunho [em]="em" (descartar)="descartarRascunho()" />
      }

      <div class="duas">
        <form class="painel form" (ngSubmit)="salvar()">
          <label class="campo">
            <span>Nome da loja</span>
            <input name="nome" [ngModel]="nome()" (ngModelChange)="nome.set($event)" maxlength="60" required autocomplete="organization" />
          </label>
          <label class="campo">
            <span>Endereço</span>
            <textarea name="endereco" [ngModel]="endereco()" (ngModelChange)="endereco.set($event)" maxlength="200" rows="2" autocomplete="street-address"></textarea>
          </label>
          <label class="campo">
            <span>Telefone</span>
            <input name="telefone" [ngModel]="telefone()" (ngModelChange)="telefone.set($event)" maxlength="30" inputmode="tel" autocomplete="tel" />
          </label>
          <label class="campo">
            <span>Mensagem de rodapé</span>
            <textarea name="rodape" [ngModel]="rodape()" (ngModelChange)="rodape.set($event)" maxlength="200" rows="2" placeholder="Ex.: Garantia de 90 dias. Obrigado pela preferência!"></textarea>
          </label>
          <p class="small muted">A notinha sempre termina com “NÃO É DOCUMENTO FISCAL”.</p>
          <button class="btn bloco" type="submit" [disabled]="!nome().trim() || !alterado() || salvando()">
            {{ salvando() ? 'Salvando…' : 'Salvar' }}
          </button>
        </form>

        <section class="previa" aria-labelledby="previa-titulo">
          <h2 id="previa-titulo">Como sai a notinha</h2>
          <p class="small muted">Venda de exemplo. Atualiza enquanto você digita.</p>
          <app-simulacao-notinha [venda]="exemplo()" [loja]="rascunho()" />
        </section>
      </div>
    </main>
  `,
  styles: `
    .pagina.larga { max-width: 1100px; }
    .duas { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; align-items: start; }
    .form { display: grid; gap: 1rem; }
    .previa { display: grid; gap: .4rem; }
    .previa app-simulacao-notinha { margin-top: .35rem; }
    @media (min-width: 900px) {
      .duas { grid-template-columns: minmax(0, 1fr) minmax(360px, 460px); }
      .previa { position: sticky; top: 1rem; }
    }
  `,
})
export class DadosLojaPagina {
  private loja = inject(LojaService);
  private auth = inject(AuthService);
  private toast = inject(Toast);

  protected nome = signal('');
  protected endereco = signal('');
  protected telefone = signal('');
  protected rodape = signal('');
  protected salvando = signal(false);

  /** O que está no formulário agora (alimenta a simulação). */
  protected rascunho = computed<DadosLoja>(() => ({
    nome: this.nome().trim() || 'Nome da loja',
    endereco: this.endereco().trim(),
    telefone: this.telefone().trim(),
    rodape: this.rodape().trim(),
  }));

  protected alterado = computed(() => !this.igualA(this.loja.dados()));

  /** O formulário tem exatamente estes dados? */
  private igualA(d: DadosLoja): boolean {
    return (
      this.nome().trim() === d.nome &&
      this.endereco().trim() === d.endereco &&
      this.telefone().trim() === d.telefone &&
      this.rodape().trim() === d.rodape
    );
  }

  protected exemplo = computed<NotinhaVenda>(() => ({
    id: 'a1b2c3d4-0000-4000-8000-000000000000',
    criada_em: new Date().toISOString(),
    vendedor: this.auth.perfil()?.nome ?? 'Vendedor',
    cliente: 'Cliente de exemplo',
    tipo_preco: 'varejo',
    pagamento: 'pix',
    itens: [
      { codigo: '01-02', tipo: 'Telas', nome: 'Tela Samsung Galaxy A32 5G com aro, digitalizador e película de proteção instalada', variacao: 'Preta', quantidade: 1, preco_unitario: 260 },
      { codigo: '03-01', tipo: 'Conector Carga', nome: 'Conector de carga Tipo-C', variacao: 'Padrão', quantidade: 2, preco_unitario: 18 },
      { codigo: '7891234567890', tipo: 'Películas', nome: 'Película de vidro 3D', variacao: 'Padrão', quantidade: 1, preco_unitario: 25 },
    ],
    total: 321,
    pendente: false,
    cancelada: false,
  }));

  constructor() {
    this.loja.atualizar();
    // Preenche com o que está salvo; quando chega versão nova do servidor, só
    // substitui se o admin ainda não mexeu no formulário
    let base: DadosLoja | null = null;
    effect(() => {
      const d = this.loja.dados();
      untracked(() => {
        if (!base || this.igualA(base)) this.preencher(d);
        base = d;
      });
    });
    // Alteração não salva fica guardada no aparelho até salvar ou descartar
    this.guardado = inject(RascunhoService).vincular<DadosLoja>('loja', {
      estado: () => (this.alterado() ? this.rascunhoForm() : null),
      restaurar: (d) => this.preencher(d),
    });
    // Com alteração não salva, a versão nova do app espera
    const liberar = inject(AtualizacaoService).bloquear(() => this.alterado());
    inject(DestroyRef).onDestroy(liberar);
  }

  /** Alteração não salva guardada no aparelho. */
  protected guardado: Rascunho;

  /** O formulário como está, sem os ajustes da simulação. */
  private rascunhoForm(): DadosLoja {
    return { nome: this.nome(), endereco: this.endereco(), telefone: this.telefone(), rodape: this.rodape() };
  }

  private preencher(d: DadosLoja) {
    this.nome.set(d.nome);
    this.endereco.set(d.endereco);
    this.telefone.set(d.telefone);
    this.rodape.set(d.rodape);
  }

  protected descartarRascunho() {
    this.guardado.descartar();
    this.preencher(this.loja.dados());
  }

  protected async salvar() {
    if (!this.nome().trim() || this.salvando()) return;
    this.salvando.set(true);
    try {
      await this.loja.gravar({
        nome: this.nome(),
        endereco: this.endereco(),
        telefone: this.telefone(),
        rodape: this.rodape(),
      });
      this.toast.mostrar('Dados da loja salvos', 'ok');
    } catch (e) {
      this.toast.mostrar(mensagemErro(e), 'erro', 5000);
    } finally {
      this.salvando.set(false);
    }
  }
}
