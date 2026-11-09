import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CatalogoService, ConexaoService } from '../core/catalogo.service';
import { VendasService } from '../core/vendas.service';
import { Icone } from '../shared/ui';

interface Aba {
  rota: string;
  rotulo: string;
  icone: string;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icone],
  template: `
    @if (!conexao.online() || vendas.minhaFila().length) {
      <div class="faixa" [class.off]="!conexao.online()" role="status">
        <i-con [nome]="conexao.online() ? 'nuvem' : 'sem_nuvem'" />
        @if (!conexao.online()) {
          <span>Sem internet. As vendas ficam guardadas no aparelho.</span>
        } @else {
          <span>Enviando {{ vendas.minhaFila().length }} venda(s) guardada(s)…</span>
        }
        @if (vendas.minhaFila().length && !conexao.online()) {
          <strong class="num">{{ vendas.minhaFila().length }} na fila</strong>
        }
      </div>
    }

    <router-outlet />

    <nav class="abas" aria-label="Navegação principal">
      @for (a of abas(); track a.rota) {
        <a [routerLink]="a.rota" routerLinkActive="ativa" [attr.aria-label]="a.rotulo">
          <i-con [nome]="a.icone" />
          <span>{{ a.rotulo }}</span>
        </a>
      }
    </nav>
  `,
  styles: `
    .faixa {
      position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: .5rem;
      padding: .55rem 1rem; padding-top: calc(env(safe-area-inset-top, 0px) + .55rem);
      background: var(--ink); color: #fff; font-size: .88rem; font-weight: 600;
    }
    .faixa.off { background: var(--warn); }
    .faixa span { flex: 1; }
    .abas {
      position: fixed; z-index: 30; left: 0; right: 0; bottom: 0;
      display: flex; justify-content: space-around;
      height: calc(var(--nav-h) + var(--safe-b)); padding-bottom: var(--safe-b);
      background: var(--surface); border-top: 1px solid var(--line);
    }
    .abas a {
      flex: 1; display: grid; place-items: center; align-content: center; gap: 2px;
      color: var(--muted); text-decoration: none; font-size: .72rem; font-weight: 650;
    }
    .abas a.ativa { color: var(--cobalt); }
    .abas a.ativa i-con { background: #e4e9fb; border-radius: 99px; }
    .abas i-con { padding: 3px 14px; }
  `,
})
export class Shell {
  protected auth = inject(AuthService);
  protected conexao = inject(ConexaoService);
  protected vendas = inject(VendasService);
  private catalogo = inject(CatalogoService);

  protected abas = computed<Aba[]>(() =>
    this.auth.isAdmin()
      ? [
          { rota: '/vender', rotulo: 'Vender', icone: 'vender' },
          { rota: '/catalogo', rotulo: 'Catálogo', icone: 'catalogo' },
          { rota: '/admin/painel', rotulo: 'Painel', icone: 'painel' },
          { rota: '/admin/estoque', rotulo: 'Estoque', icone: 'estoque' },
          { rota: '/admin/mais', rotulo: 'Mais', icone: 'mais' },
        ]
      : [
          { rota: '/vender', rotulo: 'Vender', icone: 'vender' },
          { rota: '/catalogo', rotulo: 'Catálogo', icone: 'catalogo' },
          { rota: '/minhas-vendas', rotulo: 'Minhas vendas', icone: 'historico' },
        ],
  );

  constructor() {
    this.catalogo.iniciar();
    this.vendas.iniciar();
  }
}
