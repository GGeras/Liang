import { openDB, IDBPDatabase } from 'idb';

/**
 * Cofre local: IndexedDB com conteúdo criptografado (AES-GCM 256).
 * A chave é gerada no próprio aparelho como NÃO-exportável — o JavaScript
 * consegue usá-la, mas nunca ler seus bytes. Quem abrir o IndexedDB pelo
 * navegador vê só dados cifrados.
 */
interface Cifrado {
  iv: Uint8Array<ArrayBuffer>;
  dados: ArrayBuffer;
}

const DB = 'liang';
let dbp: Promise<IDBPDatabase> | null = null;
let chave: Promise<CryptoKey> | null = null;

function db() {
  dbp ??= openDB(DB, 1, {
    upgrade(d) {
      d.createObjectStore('chaves');
      d.createObjectStore('dados');
    },
  });
  return dbp;
}

function obterChave(): Promise<CryptoKey> {
  chave ??= (async () => {
    const d = await db();
    const existente = (await d.get('chaves', 'principal')) as CryptoKey | undefined;
    if (existente) return existente;
    const nova = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    await d.put('chaves', nova, 'principal');
    return nova;
  })();
  return chave;
}

/**
 * Gravações do mesmo nome entram em fila: cifrar é assíncrono e, sem a fila, uma
 * gravação mais antiga podia terminar depois da nova e voltar a fila de vendas
 * para um estado anterior (ex.: venda feita offline sumindo ao reabrir o app).
 */
const gravacoes = new Map<string, Promise<void>>();

function emOrdem(nome: string, fn: () => Promise<void>): Promise<void> {
  const anterior = gravacoes.get(nome) ?? Promise.resolve();
  const atual = anterior.catch(() => undefined).then(fn);
  gravacoes.set(nome, atual);
  atual.finally(() => gravacoes.get(nome) === atual && gravacoes.delete(nome)).catch(() => undefined);
  return atual;
}

export function salvar<T>(nome: string, valor: T): Promise<void> {
  // Copia agora: o valor pode mudar enquanto espera a vez
  const json = JSON.stringify(valor);
  return emOrdem(nome, async () => {
    const k = await obterChave();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const dados = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(json));
    await (await db()).put('dados', { iv, dados } satisfies Cifrado, nome);
  });
}

export async function ler<T>(nome: string, padrao: T): Promise<T> {
  // Espera gravação/remoção em andamento deste nome: lê sempre o estado mais novo
  await gravacoes.get(nome)?.catch(() => undefined);
  try {
    const c = (await (await db()).get('dados', nome)) as Cifrado | undefined;
    if (!c) return padrao;
    const k = await obterChave();
    const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: c.iv as Uint8Array<ArrayBuffer> }, k, c.dados);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return padrao;
  }
}

export function apagar(nome: string): Promise<void> {
  return emOrdem(nome, async () => {
    await (await db()).delete('dados', nome);
  });
}

/** Nomes guardados que começam com o prefixo (ex.: rascunhos). */
export async function nomes(prefixo: string): Promise<string[]> {
  try {
    const todas = (await (await db()).getAllKeys('dados')) as string[];
    return todas.filter((k) => typeof k === 'string' && k.startsWith(prefixo));
  } catch {
    return [];
  }
}
