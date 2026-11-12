import { Routes } from '@angular/router';
import { adminGuard, deslogadoGuard, logadoGuard } from './core/guards';

export const routes: Routes = [
  // Pública: link para mandar aos vendedores instalarem o app
  { path: 'instalar', loadComponent: () => import('./features/instalar').then((m) => m.Instalar) },
  { path: 'entrar', canActivate: [deslogadoGuard], loadComponent: () => import('./features/entrar').then((m) => m.Entrar) },
  {
    path: '',
    canActivate: [logadoGuard],
    loadComponent: () => import('./features/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'vender' },
      { path: 'vender', loadComponent: () => import('./features/vendedor/vender').then((m) => m.Vender) },
      { path: 'catalogo', loadComponent: () => import('./features/vendedor/catalogo').then((m) => m.Catalogo) },
      { path: 'minhas-vendas', loadComponent: () => import('./features/vendedor/minhas-vendas').then((m) => m.MinhasVendas) },
      { path: 'notinha/:id', loadComponent: () => import('./features/notinha-pagina').then((m) => m.NotinhaPagina) },
      {
        path: 'admin',
        canActivate: [adminGuard],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'painel' },
          { path: 'painel', loadComponent: () => import('./features/admin/painel').then((m) => m.Painel) },
          { path: 'estoque', loadComponent: () => import('./features/admin/estoque').then((m) => m.Estoque) },
          { path: 'produtos', loadComponent: () => import('./features/admin/produtos').then((m) => m.Produtos) },
          { path: 'produtos/novo', loadComponent: () => import('./features/admin/produto-form').then((m) => m.ProdutoForm) },
          { path: 'produtos/:id', loadComponent: () => import('./features/admin/produto-form').then((m) => m.ProdutoForm) },
          { path: 'vendas', loadComponent: () => import('./features/admin/vendas').then((m) => m.VendasAdmin) },
          { path: 'movimentos', loadComponent: () => import('./features/admin/movimentos').then((m) => m.Movimentos) },
          { path: 'ocorrencias', loadComponent: () => import('./features/admin/ocorrencias').then((m) => m.Ocorrencias) },
          { path: 'usuarios', loadComponent: () => import('./features/admin/usuarios').then((m) => m.Usuarios) },
          { path: 'mais', loadComponent: () => import('./features/admin/mais').then((m) => m.Mais) },
          { path: 'loja', loadComponent: () => import('./features/admin/dados-loja').then((m) => m.DadosLojaPagina) },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
