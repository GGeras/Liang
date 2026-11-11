import { Injectable, signal } from '@angular/core';
import { MODELOS_ZH, TEXTOS_ZH } from './idioma.zh';

export type Idioma = 'pt-BR' | 'zh-CN';
const CHAVE = 'liang.idioma';
const ATRIBUTOS = ['aria-label', 'placeholder', 'title', 'alt'];

interface Registro {
  original: string; // texto em português, como o Angular escreveu
  traduzido: string; // o que está na tela agora
}

/** Modelo "Pediu {}, havia {}" vira uma expressão com grupos no lugar de cada {}. */
const MODELOS = Object.entries(MODELOS_ZH)
  .sort(([a], [b]) => b.replace(/\{\}/g, '').length - a.replace(/\{\}/g, '').length)
  .map(([pt, zh]) => ({
    re: new RegExp('^' + pt.split('{}').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)') + '$', 's'),
    zh,
  }));

/**
 * Tradução do sistema (português do Brasil ↔ mandarim).
 *
 * As telas continuam escritas em português. Com o mandarim ligado, este serviço
 * observa o DOM e troca cada texto (e aria-label, placeholder, title, alt) pela
 * versão de `idioma.zh.ts`. O original fica guardado e volta ao trocar para PT-BR.
 * Texto sem tradução cadastrada fica em português. Dados digitados (nomes de
 * produto, clientes) não estão no dicionário e não mudam.
 * Para não traduzir um trecho, use `translate="no"` no elemento.
 */
@Injectable({ providedIn: 'root' })
export class IdiomaService {
  readonly idioma = signal<Idioma>(lerSalvo());
  private textos = new WeakMap<Text, Registro>();
  private atributos = new WeakMap<Element, Map<string, Registro>>();
  private observador = new MutationObserver((lista) => this.mudou(lista));

  constructor() {
    this.aplicar();
  }

  definir(idioma: Idioma) {
    if (idioma === this.idioma()) return;
    this.idioma.set(idioma);
    try {
      localStorage.setItem(CHAVE, idioma);
    } catch {
      /* navegador sem armazenamento: vale só nesta aba */
    }
    this.aplicar();
  }

  /** Tradução de um texto solto (para quem precisa do texto fora da tela). */
  t(pt: string): string {
    return this.idioma() === 'zh-CN' ? (traduzir(pt) ?? pt) : pt;
  }

  private aplicar() {
    document.documentElement.lang = this.idioma();
    this.observador.disconnect();
    this.percorrer(document.body);
    if (this.idioma() === 'zh-CN') {
      this.observador.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ATRIBUTOS,
      });
    }
  }

  private mudou(lista: MutationRecord[]) {
    for (const m of lista) {
      if (m.type === 'childList') m.addedNodes.forEach((n) => this.percorrer(n));
      else if (m.type === 'characterData') this.texto(m.target as Text);
      else if (m.attributeName) this.atributo(m.target as Element, m.attributeName);
    }
  }

  private percorrer(raiz: Node) {
    if (raiz.nodeType === Node.TEXT_NODE) return this.texto(raiz as Text);
    if (!(raiz instanceof Element) || ignorar(raiz)) return;
    for (const a of ATRIBUTOS) if (raiz.hasAttribute(a)) this.atributo(raiz, a);
    for (const filho of Array.from(raiz.childNodes)) this.percorrer(filho);
  }

  private texto(no: Text) {
    const pai = no.parentElement;
    // Texto dentro de textarea é o valor do campo: nunca mexer
    if (!pai || pai.tagName === 'TEXTAREA' || ignorar(pai)) return;
    let r = this.textos.get(no);
    // Se o texto atual não é o que nós escrevemos, quem mudou foi o app: é o novo original
    if (!r || no.data !== r.traduzido) {
      r = { original: no.data, traduzido: no.data };
      this.textos.set(no, r);
    }
    const novo = this.idioma() === 'zh-CN' ? (traduzir(r.original) ?? r.original) : r.original;
    if (novo !== no.data) no.data = novo;
    r.traduzido = novo;
  }

  private atributo(el: Element, nome: string) {
    const valor = el.getAttribute(nome);
    if (valor === null) return;
    let mapa = this.atributos.get(el);
    if (!mapa) this.atributos.set(el, (mapa = new Map()));
    let r = mapa.get(nome);
    if (!r || valor !== r.traduzido) {
      r = { original: valor, traduzido: valor };
      mapa.set(nome, r);
    }
    const novo = this.idioma() === 'zh-CN' ? (traduzir(r.original) ?? r.original) : r.original;
    if (novo !== valor) el.setAttribute(nome, novo);
    r.traduzido = novo;
  }
}

function lerSalvo(): Idioma {
  try {
    return localStorage.getItem(CHAVE) === 'zh-CN' ? 'zh-CN' : 'pt-BR';
  } catch {
    return 'pt-BR';
  }
}

function ignorar(el: Element): boolean {
  return (
    el.closest('[translate="no"], script, style') !== null ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

/** Traduz mantendo os espaços das pontas; null quando não há tradução. */
export function traduzir(texto: string): string | null {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(texto)!;
  if (!/[A-Za-zÀ-ú]/.test(m[2])) return null;
  const nucleo = m[2].replace(/\s+/g, ' ');
  const zh = traduzirNucleo(nucleo, 0) ?? traduzirPartes(nucleo);
  return zh === null ? null : m[1] + zh + m[3];
}

function traduzirNucleo(s: string, nivel: number): string | null {
  const exato = TEXTOS_ZH[s];
  if (exato !== undefined) return exato;
  if (nivel > 1) return null;
  for (const { re, zh } of MODELOS) {
    const m = re.exec(s);
    if (!m) continue;
    let i = 1;
    // O que entra no {} (número, nome, preço) só é traduzido se for um texto conhecido
    return zh.replace(/\{\}/g, () => {
      const parte = m[i++];
      return traduzirNucleo(parte, nivel + 1) ?? parte;
    });
  }
  return null;
}

/** "3 itens · Atacado · Pix": traduz cada pedaço separado por " · ". */
function traduzirPartes(s: string): string | null {
  if (!s.includes(' · ')) return null;
  let mudou = false;
  const partes = s.split(' · ').map((p) => {
    const zh = traduzirNucleo(p, 0);
    if (zh !== null) mudou = true;
    return zh ?? p;
  });
  return mudou ? partes.join(' · ') : null;
}
