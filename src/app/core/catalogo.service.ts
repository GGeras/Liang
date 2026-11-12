import { Injectable, computed, signal } from '@angular/core';
import { supabase } from './supabase';
import { ItemCatalogo } from './models';
import { ler, salvar } from './cofre';

@Injectable({ providedIn: 'root' })
export class ConexaoService {
  readonly online = signal(navigator.onLine);
  constructor() {
    addEventListener('online', () => this.online.set(true));
    addEventListener('offline', () => this.online.set(false));
  }
}

/** Normaliza "103", "0103", "01-03", "1-3" para "01-03". */
export function normalizarCodigo(entrada: string): string | null {
  const t = entrada.trim();
  const comHifen = t.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (comHifen) return `${comHifen[1].padStart(2, '0')}-${comHifen[2].padStart(2, '0')}`;
  const so = t.replace(/\D/g, '');
  if (t.length === so.length && (so.length === 4 || so.length === 3)) {
    const p = so.padStart(4, '0');
    return `${p.slice(0, 2)}-${p.slice(2)}`;
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  readonly itens = signal<ItemCatalogo[]>([]);
  readonly atualizadoEm = signal<string | null>(null);
  readonly carregando = signal(false);

  readonly porCodigo = computed(() => {
    const m = new Map<string, ItemCatalogo[]>();
    for (const i of this.itens()) {
      if (!i.codigo) continue; // produto com código de barras não tem 00-00
      const l = m.get(i.codigo) ?? [];
      l.push(i);
      m.set(i.codigo, l);
    }
    return m;
  });

  readonly porBarras = computed(() => {
    const m = new Map<string, ItemCatalogo>();
    for (const i of this.itens()) if (i.codigo_barras) m.set(i.codigo_barras, i);
    return m;
  });

  private iniciado = false;
  /** Número da última busca: só a mais recente vale (uma antiga não desfaz uma entrada recém-feita). */
  private busca = 0;

  async iniciar() {
    if (this.iniciado) return;
    this.iniciado = true;
    const cache = await ler<{ itens: ItemCatalogo[]; em: string } | null>('catalogo', null);
    if (cache) {
      this.itens.set(cache.itens);
      this.atualizadoEm.set(cache.em);
    }
    await this.atualizar();
  }

  /** Busca o catálogo completo no servidor e guarda criptografado no aparelho. */
  async atualizar(): Promise<boolean> {
    if (!navigator.onLine) return false;
    const vez = ++this.busca;
    this.carregando.set(true);
    try {
      const todos: ItemCatalogo[] = [];
      const passo = 1000;
      for (let de = 0; ; de += passo) {
        const { data, error } = await supabase
          .from('vw_catalogo')
          .select('*')
          .order('codigo')
          .order('variacao')
          .range(de, de + passo - 1);
        if (error) throw error;
        todos.push(...(data as ItemCatalogo[]));
        if (!data || data.length < passo) break;
      }
      if (vez !== this.busca) return true;
      const em = new Date().toISOString();
      this.itens.set(todos);
      this.atualizadoEm.set(em);
      await salvar('catalogo', { itens: todos, em });
      return true;
    } catch {
      return false;
    } finally {
      if (vez === this.busca) this.carregando.set(false);
    }
  }

  buscarCodigo(entrada: string): ItemCatalogo[] {
    const cod = normalizarCodigo(entrada);
    return cod ? (this.porCodigo().get(cod) ?? []) : [];
  }

  buscarBarras(barras: string): ItemCatalogo | undefined {
    return this.porBarras().get(barras.trim());
  }

  pesquisar(termo: string): ItemCatalogo[] {
    const t = termo
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');
    if (!t) return this.itens();
    const cod = normalizarCodigo(termo);
    return this.itens().filter((i) => {
      if (cod && i.codigo === cod) return true;
      const alvo = [i.codigo, i.codigo_barras, i.nome, i.marca, i.modelo, i.variacao, i.tipo, ...i.compativeis]
        .join(' ')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '');
      return t.split(/\s+/).every((p) => alvo.includes(p));
    });
  }

  /** Desconta localmente o que foi vendido offline, para não vender o que já saiu. */
  async baixarLocal(itens: { variacao_id: string; quantidade: number }[]) {
    const mapa = new Map(itens.map((i) => [i.variacao_id, i.quantidade]));
    this.itens.update((l) =>
      l.map((i) => (mapa.has(i.variacao_id) ? { ...i, estoque: i.estoque - mapa.get(i.variacao_id)! } : i)),
    );
    await salvar('catalogo', { itens: this.itens(), em: this.atualizadoEm() });
  }
}
