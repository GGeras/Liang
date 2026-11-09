import { Injectable, computed, signal } from '@angular/core';

/** Evento do Chrome/Edge/Android que permite abrir o pedido de instalação do PWA. */
interface PedidoInstalacao extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Instalação do PWA. O navegador dispara `beforeinstallprompt` logo na abertura,
 * antes de a tela /instalar existir; por isso o evento é guardado aqui, desde o início.
 */
@Injectable({ providedIn: 'root' })
export class InstalacaoService {
  private pedido = signal<PedidoInstalacao | null>(null);
  readonly instalado = signal(
    matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
  );
  /** O navegador oferece instalação com um toque (Chrome, Edge, Samsung Internet). */
  readonly podeInstalar = computed(() => !!this.pedido() && !this.instalado());
  /** iPhone/iPad: não há botão; instala-se pelo menu Compartilhar do Safari. */
  readonly ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  constructor() {
    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // não mostra a faixa do navegador; o botão da tela /instalar abre o pedido
      this.pedido.set(e as PedidoInstalacao);
    });
    addEventListener('appinstalled', () => {
      this.instalado.set(true);
      this.pedido.set(null);
    });
  }

  /** Abre o pedido de instalação; devolve true se a pessoa aceitou. */
  async instalar(): Promise<boolean> {
    const p = this.pedido();
    if (!p) return false;
    await p.prompt();
    const { outcome } = await p.userChoice;
    this.pedido.set(null); // o mesmo evento só pode ser usado uma vez
    if (outcome === 'accepted') this.instalado.set(true);
    return outcome === 'accepted';
  }
}
