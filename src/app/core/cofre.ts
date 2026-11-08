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

export async function salvar<T>(nome: string, valor: T): Promise<void> {
  const k = await obterChave();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(JSON.stringify(valor));
  const dados = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, bytes);
  await (await db()).put('dados', { iv, dados } satisfies Cifrado, nome);
}

export async function ler<T>(nome: string, padrao: T): Promise<T> {
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

export async function apagar(nome: string): Promise<void> {
  await (await db()).delete('dados', nome);
}
