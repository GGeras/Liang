import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// inject() só funciona antes do primeiro await: depois dele o Angular já saiu do
// contexto de injeção (erro NG0203 e tela em branco). Por isso o Router vem antes.

export const logadoGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.aguardar();
  return auth.perfil() ? true : router.parseUrl('/entrar');
};

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.aguardar();
  return auth.isAdmin() ? true : router.parseUrl('/vender');
};

export const deslogadoGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.aguardar();
  return auth.perfil() ? router.parseUrl('/vender') : true;
};
