import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const logadoGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  await auth.aguardar();
  return auth.perfil() ? true : inject(Router).parseUrl('/entrar');
};

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  await auth.aguardar();
  return auth.isAdmin() ? true : inject(Router).parseUrl('/vender');
};

export const deslogadoGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  await auth.aguardar();
  return auth.perfil() ? inject(Router).parseUrl('/vender') : true;
};
