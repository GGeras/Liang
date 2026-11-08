import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { mensagemErro } from '../core/supabase';

@Component({
  selector: 'app-entrar',
  imports: [FormsModule],
  template: `
    <main class="entrar">
      <div class="marca">
        <span class="etiqueta grande">00-00</span>
        <h1>Liang</h1>
        <p class="muted">Estoque Mundo Mix</p>
      </div>

      <form class="painel form" (ngSubmit)="entrar()">
        <label class="campo">
          <span>E-mail</span>
          <input type="email" name="email" [(ngModel)]="email" autocomplete="username" required inputmode="email" />
        </label>
        <label class="campo">
          <span>Senha</span>
          <input type="password" name="senha" [(ngModel)]="senha" autocomplete="current-password" required />
        </label>
        @if (erro()) {
          <p class="erro-msg">{{ erro() }}</p>
        }
        <button class="btn bloco" type="submit" [disabled]="carregando() || !email() || !senha()">
          {{ carregando() ? 'Entrando…' : 'Entrar' }}
        </button>
      </form>
      <p class="muted small rodape">Sem acesso? Peça a um administrador para criar seu usuário.</p>
    </main>
  `,
  styles: `
    .entrar { min-height: 100dvh; display: grid; align-content: center; gap: 1.5rem; padding: 1.5rem 1rem; max-width: 420px; margin: 0 auto; }
    .marca { display: grid; gap: .35rem; }
    .marca h1 { font-size: 3rem; font-stretch: 125%; letter-spacing: -.01em; }
    .etiqueta.grande { font-size: 1.1rem; justify-self: start; }
    .form { display: grid; gap: 1rem; padding: 1.25rem; }
    .rodape { text-align: center; }
  `,
})
export class Entrar {
  private auth = inject(AuthService);
  private router = inject(Router);
  email = signal('');
  senha = signal('');
  erro = signal('');
  carregando = signal(false);

  async entrar() {
    this.erro.set('');
    this.carregando.set(true);
    try {
      await this.auth.entrar(this.email().trim(), this.senha());
      await this.router.navigateByUrl(this.auth.isAdmin() ? '/admin/painel' : '/vender');
    } catch (e) {
      this.erro.set(mensagemErro(e));
    } finally {
      this.carregando.set(false);
    }
  }
}
