import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { VendasService } from '../../core/vendas.service';
import { Icone, Toast } from '../../shared/ui';

@Component({
  selector: 'app-mais',
  imports: [RouterLink, Icone],
  template: `
    <main class="pagina">
      <header class="cabecalho">
        <div>
          <h1>{{ auth.perfil()?.nome }}</h1>
          <p class="muted small">Administrador</p>
        </div>
      </header>
      <ul class="lista menu">
        @for (i of itens; track i.rota) {
          <li>
            <a [routerLink]="i.rota"><i-con [nome]="i.icone" /><span><strong>{{ i.nome }}</strong><br /><span class="muted small">{{ i.desc }}</span></span></a>
          </li>
        }
      </ul>
      <button class="btn sec bloco" (click)="sair()"><i-con nome="sair" /> Sair</button>
    </main>
  `,
  styles: `
    .menu a { display: flex; gap: .9rem; align-items: center; padding: .9rem 1rem; color: inherit; text-decoration: none; }
    .menu i-con { color: var(--cobalt); }
  `,
})
export class Mais {
  protected auth = inject(AuthService);
  private vendas = inject(VendasService);
  private toast = inject(Toast);
  private router = inject(Router);
  protected itens = [
    { rota: '/admin/produtos', nome: 'Produtos e catálogo', desc: 'Cadastrar e editar produtos, preços, tipos e compatibilidades', icone: 'catalogo' },
    { rota: '/admin/vendas', nome: 'Vendas', desc: 'Todas as vendas, por vendedor; cancelamentos', icone: 'vender' },
    { rota: '/admin/movimentos', nome: 'Movimentações', desc: 'Histórico de entradas, saídas e ajustes', icone: 'historico' },
    { rota: '/admin/ocorrencias', nome: 'Ocorrências', desc: 'Vendas recusadas por falta de estoque', icone: 'alerta' },
    { rota: '/admin/usuarios', nome: 'Usuários', desc: 'Vendedores e administradores', icone: 'usuarios' },
  ];

  async sair() {
    if (this.vendas.fila().length) {
      this.toast.mostrar('Há vendas guardadas sem envio. Conecte à internet antes de sair.', 'erro', 5000);
      return;
    }
    await this.auth.sair();
    this.router.navigateByUrl('/entrar');
  }
}
