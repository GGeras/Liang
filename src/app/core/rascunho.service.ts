import { DestroyRef, Injectable, Signal, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from './auth.service';
import { apagar, ler, nomes, salvar } from './cofre';

/**
 * Rascunhos: o que está em andamento (carrinho da venda, cadastro de produto,
 * dados da loja) fica guardado no aparelho enquanto é feito. Se a página
 * recarregar (atualização do app, F5, o Android fechar o app em segundo plano),
 * volta do ponto em que parou.
 *
 * - Guardado no cofre (criptografado), separado por usuário: um vendedor nunca vê
 *   o rascunho de outro no mesmo aparelho.
 * - Vale 24 h; depois disso é descartado.
 * - Nunca guardar senha num rascunho.
 */

const PREFIXO = 'rascunho:';
const VALIDADE_MS = 24 * 60 * 60 * 1000;
/** Espera depois da última mudança antes de gravar (digitação contínua grava uma vez só). */
const ESPERA_MS = 400;

interface Guardado<T> {
  v: T;
  em: number;
}

export interface Rascunho {
  /** Quando foi feito o rascunho recuperado ao abrir; null se nada foi recuperado. */
  readonly recuperado: Signal<string | null>;
  /** Apaga o rascunho do aparelho (a tela volta ao que está salvo por conta própria). */
  descartar(): void;
}

export interface OpcoesRascunho<T> {
  /** O que guardar agora; null quando não há nada em andamento (apaga o rascunho). */
  estado: () => T | null;
  /** Põe de volta na tela o que foi guardado. */
  restaurar: (v: T) => void;
  /** A tela já carregou o que vem do servidor? O rascunho só é aplicado depois disso. */
  pronto?: () => boolean;
}

@Injectable({ providedIn: 'root' })
export class RascunhoService {
  private auth = inject(AuthService);
  /** Gravações esperando a pausa da digitação: saem na hora se o app for para segundo plano. */
  private pendentes = new Set<() => void>();

  constructor() {
    const gravarTudo = () => [...this.pendentes].forEach((g) => g());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') gravarTudo();
    });
    addEventListener('pagehide', gravarTudo);
    setTimeout(() => this.limparVencidos(), 15_000);
  }

  /**
   * Liga um rascunho à tela. Chamar no construtor (contexto de injeção).
   * A chave pode ser uma função: é lida quando a tela fica pronta (inputs da rota já chegaram).
   */
  vincular<T>(chave: string | (() => string), o: OpcoesRascunho<T>): Rascunho {
    const recuperado = signal<string | null>(null);
    /** Já tentou recuperar o rascunho do usuário atual (só então começa a gravar). */
    const restaurado = signal(false);
    let nome: string | null = null;
    let pendente: { nome: string; v: T | null } | undefined;
    let espera: ReturnType<typeof setTimeout> | undefined;
    let vez = 0;

    const gravar = () => {
      clearTimeout(espera);
      this.pendentes.delete(gravar);
      const p = pendente;
      pendente = undefined;
      if (!p) return;
      const feito = p.v === null ? apagar(p.nome) : salvar<Guardado<T>>(p.nome, { v: p.v, em: Date.now() });
      feito.catch(() => undefined); // memória cheia: segue sem rascunho, a tela continua funcionando
    };

    // Usuário (ou prontidão da tela) mudou: grava o anterior e recupera o deste
    effect(() => {
      const uid = this.auth.perfil()?.id;
      const pronto = o.pronto?.() ?? true;
      untracked(() => {
        const novo = uid && pronto ? `${PREFIXO}${uid}:${typeof chave === 'string' ? chave : chave()}` : null;
        if (novo === nome) return;
        gravar();
        nome = novo;
        restaurado.set(false);
        recuperado.set(null);
        const esta = ++vez;
        if (!novo) return;
        ler<Guardado<T> | null>(novo, null).then((g) => {
          if (esta !== vez) return;
          if (g && g.v !== null && Date.now() - g.em < VALIDADE_MS) {
            o.restaurar(g.v);
            recuperado.set(new Date(g.em).toISOString());
          } else if (g) {
            apagar(novo).catch(() => undefined);
          }
          restaurado.set(true);
        });
      });
    });

    // Cada mudança agenda a gravação
    effect(() => {
      const v = o.estado();
      if (!restaurado()) return;
      untracked(() => {
        if (!nome) return;
        pendente = { nome, v };
        this.pendentes.add(gravar);
        clearTimeout(espera);
        espera = setTimeout(gravar, ESPERA_MS);
      });
    });

    // Saiu da tela: o que estava esperando grava agora
    inject(DestroyRef).onDestroy(() => {
      gravar();
      vez++;
    });

    return {
      recuperado,
      descartar: () => {
        clearTimeout(espera);
        this.pendentes.delete(gravar);
        pendente = undefined;
        recuperado.set(null);
        if (nome) apagar(nome).catch(() => undefined);
      },
    };
  }

  /** Apaga rascunhos vencidos (de qualquer usuário do aparelho). */
  private async limparVencidos() {
    for (const n of await nomes(PREFIXO)) {
      const g = await ler<Guardado<unknown> | null>(n, null);
      if (!g || Date.now() - g.em >= VALIDADE_MS) await apagar(n).catch(() => undefined);
    }
  }
}
