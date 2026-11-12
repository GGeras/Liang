import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { supabase, mensagemErro } from '../../core/supabase';
import { AuthService } from '../../core/auth.service';
import { Papel, Perfil } from '../../core/models';
import { Icone, Toast } from '../../shared/ui';
import { Ajuda } from '../../shared/ajuda';

@Component({
  selector: 'app-usuarios',
  imports: [FormsModule, Icone, Ajuda],
  template: `
    <main class="pagina">
      <header class="cabecalho">
        <h1>Usuários</h1>
        <button class="btn pequeno" (click)="novo()"><i-con nome="mais1" /> Usuário</button>
      </header>

      <ul class="lista">
        @for (p of lista(); track p.id) {
          <li class="usuario" [class.inativo]="!p.ativo">
            <div>
              <strong>{{ p.nome }}</strong>
              @if (p.id === auth.perfil()?.id) {
                <span class="muted small"> · você</span>
              }
              <div class="selos">
                <span class="selo" [class.ok]="p.papel === 'admin'">{{ p.papel === 'admin' ? 'Administrador' : 'Vendedor' }}</span>
                @if (!p.ativo) {
                  <span class="selo perigo">Desativado</span>
                }
              </div>
            </div>
            <button class="btn-icone" (click)="editar(p)" [attr.aria-label]="'Editar ' + p.nome"><i-con nome="editar" /></button>
          </li>
        }
      </ul>
    </main>

    <dialog #dlg class="folha" aria-labelledby="usuario-titulo">
      <div class="topo">
        <h2 id="usuario-titulo">{{ sel() ? sel()!.nome : 'Novo usuário' }}</h2>
        <button class="btn-icone" (click)="dlg.close()" aria-label="Fechar"><i-con nome="fechar" /></button>
      </div>
      <div class="form">
        @if (!sel()) {
          <label class="campo"><span>Nome</span><input [ngModel]="nome()" (ngModelChange)="nome.set($event)" autocapitalize="words" /></label>
          <label class="campo"><span>E-mail de acesso</span><input type="email" inputmode="email" [ngModel]="email()" (ngModelChange)="email.set($event)" /></label>
        }
        <div class="campo">
          <span class="rotulo-ajuda"><span>Perfil</span><app-ajuda sobre="Perfil" texto="Vendedor vende e vê só as próprias vendas; Administrador também cuida de estoque, produtos, vendas e usuários." /></span>
          <div class="segmento" role="group" aria-label="Perfil">
            <button [attr.aria-pressed]="papel() === 'vendedor'" (click)="papel.set('vendedor')" [disabled]="proprio()">Vendedor</button>
            <button [attr.aria-pressed]="papel() === 'admin'" (click)="papel.set('admin')" [disabled]="proprio()">Administrador</button>
          </div>
        </div>
        @if (sel()) {
          <span class="linha-ajuda"><label class="ativo"><input type="checkbox" [ngModel]="ativo()" (ngModelChange)="ativo.set($event)" [disabled]="proprio()" /> Acesso ativo</label><app-ajuda sobre="Acesso ativo" texto="Desmarque para bloquear a entrada desta pessoa sem apagar as vendas e o histórico dela." /></span>
          <button class="btn bloco" (click)="salvarPerfil()" [disabled]="salvando()">Salvar</button>
          <hr />
        }
        <label class="campo"><span>{{ sel() ? 'Nova senha' : 'Senha inicial' }} (mín. 8 caracteres)</span><input type="text" autocomplete="new-password" [ngModel]="senha()" (ngModelChange)="senha.set($event)" /></label>
        @if (sel()) {
          <button class="btn sec bloco" (click)="trocarSenha()" [disabled]="senha().length < 8 || salvando()">Definir nova senha</button>
        } @else {
          <button class="btn bloco" (click)="criar()" [disabled]="!nome().trim() || !email().trim() || senha().length < 8 || salvando()">Criar usuário</button>
        }
      </div>
    </dialog>
  `,
  styles: `
    .usuario { display: flex; justify-content: space-between; align-items: center; padding: .8rem 1rem; }
    .usuario.inativo strong { color: var(--muted); }
    .selos { display: flex; gap: .35rem; margin-top: .25rem; }
    .topo { display: flex; justify-content: space-between; align-items: center; }
    .form { display: grid; gap: 1rem; margin-top: 1rem; }
    .ativo { display: flex; align-items: center; gap: .5rem; font-weight: 600; }
    .ativo input { width: 20px; height: 20px; accent-color: var(--cobalt); }
    hr { border: 0; border-top: 1px solid var(--line); width: 100%; margin: 0; }
  `,
})
export class Usuarios {
  protected auth = inject(AuthService);
  private toast = inject(Toast);
  protected lista = signal<Perfil[]>([]);
  protected sel = signal<Perfil | null>(null);
  protected nome = signal('');
  protected email = signal('');
  protected senha = signal('');
  protected papel = signal<Papel>('vendedor');
  protected ativo = signal(true);
  protected salvando = signal(false);
  private dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    this.carregar();
  }

  protected proprio() {
    return this.sel()?.id === this.auth.perfil()?.id;
  }

  private async carregar() {
    const { data } = await supabase.from('perfis').select('id, nome, papel, ativo').order('nome');
    this.lista.set((data ?? []) as Perfil[]);
  }

  protected novo() {
    this.sel.set(null);
    this.nome.set('');
    this.email.set('');
    this.senha.set('');
    this.papel.set('vendedor');
    this.dlg().nativeElement.showModal();
  }

  protected editar(p: Perfil) {
    this.sel.set(p);
    this.papel.set(p.papel);
    this.ativo.set(p.ativo);
    this.senha.set('');
    this.dlg().nativeElement.showModal();
  }

  private async chamar(corpo: object) {
    this.salvando.set(true);
    const { data, error } = await supabase.functions.invoke('usuarios', { body: corpo });
    this.salvando.set(false);
    if (error) {
      const msg = await (error as { context?: Response }).context?.json?.().catch(() => null);
      throw new Error(msg?.erro ?? mensagemErro(error));
    }
    return data;
  }

  protected async criar() {
    try {
      await this.chamar({ acao: 'criar', nome: this.nome(), email: this.email(), senha: this.senha(), papel: this.papel() });
      this.toast.mostrar(`Usuário ${this.nome()} criado`, 'ok');
      this.dlg().nativeElement.close();
      this.carregar();
    } catch (e) {
      this.toast.mostrar((e as Error).message, 'erro', 5000);
    }
  }

  protected async trocarSenha() {
    try {
      await this.chamar({ acao: 'senha', id: this.sel()!.id, senha: this.senha() });
      this.toast.mostrar('Senha alterada', 'ok');
      this.senha.set('');
    } catch (e) {
      this.toast.mostrar((e as Error).message, 'erro', 5000);
    }
  }

  protected async salvarPerfil() {
    this.salvando.set(true);
    const { error } = await supabase.from('perfis').update({ papel: this.papel(), ativo: this.ativo() }).eq('id', this.sel()!.id);
    this.salvando.set(false);
    if (error) return this.toast.mostrar(mensagemErro(error), 'erro');
    this.toast.mostrar('Usuário atualizado', 'ok');
    this.dlg().nativeElement.close();
    this.carregar();
  }
}
