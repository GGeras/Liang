import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * Atualização do PWA.
 * O service worker baixa a versão nova em segundo plano, mas sem isto o app aberto
 * no balcão só a usaria depois de ser fechado de vez. Aqui a troca acontece sozinha
 * no primeiro momento seguro (sem venda em andamento, sem folha aberta, sem cadastro
 * sendo editado). Fora disso, a faixa "Nova versão disponível" oferece o botão.
 */
@Injectable({ providedIn: 'root' })
export class AtualizacaoService {
  private sw = inject(SwUpdate);
  private router = inject(Router);
  /** Há versão nova baixada esperando o momento de entrar. */
  readonly disponivel = signal(false);
  /** Telas que não podem ser recarregadas agora (ex.: carrinho com itens) se registram aqui. */
  private bloqueios = new Set<() => boolean>();

  constructor() {
    if (!this.sw.isEnabled) return;
    this.sw.versionUpdates.pipe(filter((e) => e.type === 'VERSION_READY')).subscribe(() => {
      this.disponivel.set(true);
      this.tentarAplicar();
    });
    // Cache corrompido ou versão apagada do servidor: só recarregar resolve
    this.sw.unrecoverable.subscribe(() => location.reload());
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.tentarAplicar());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.checar();
        this.tentarAplicar();
      }
    });
    setInterval(() => this.checar(), 15 * 60 * 1000);
  }

  /** Registra uma condição que impede recarregar agora; devolve a função para remover. */
  bloquear(condicao: () => boolean): () => void {
    this.bloqueios.add(condicao);
    return () => this.bloqueios.delete(condicao);
  }

  checar() {
    this.sw.checkForUpdate().catch(() => {
      /* sem internet: tenta de novo depois */
    });
  }

  /** Momento seguro: nada em andamento que se perderia ao recarregar. */
  podeAtualizarAgora(): boolean {
    if (document.querySelector('dialog[open]')) return false;
    if (/^\/admin\/produtos\/.+/.test(this.router.url.split('?')[0])) return false; // cadastro em edição
    for (const b of this.bloqueios) if (b()) return false;
    return true;
  }

  tentarAplicar() {
    if (this.disponivel() && this.podeAtualizarAgora()) this.atualizar();
  }

  async atualizar() {
    try {
      await this.sw.activateUpdate();
    } finally {
      location.reload();
    }
  }
}
