import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/** Tempo máximo de uma chamada ao servidor: internet ruim não pode deixar a tela presa em "Salvando…". */
const LIMITE_MS = 30_000;

/**
 * fetch com limite de tempo. O upload de foto (storage) fica de fora: pode demorar
 * de verdade numa rede lenta e não trava nada (o botão mostra "Enviando…").
 */
function fetchComLimite(entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
  if (url.includes('/storage/v1/') || typeof AbortSignal.timeout !== 'function') return fetch(entrada, init);
  const limite = AbortSignal.timeout(LIMITE_MS);
  const signal = !init?.signal ? limite : typeof AbortSignal.any === 'function' ? AbortSignal.any([init.signal, limite]) : init.signal;
  return fetch(entrada, { ...init, signal });
}

export const supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'liang-auth' },
  global: { fetch: fetchComLimite },
});

/** Falha de rede ou servidor que não respondeu a tempo (não é recusa do servidor). */
export function erroDeRede(e: unknown): boolean {
  const m = `${(e as { name?: string })?.name ?? ''} ${(e as { message?: string })?.message ?? ''}`;
  return !navigator.onLine || /Failed to fetch|NetworkError|Load failed|fetch|Timeout|timed out|AbortError|aborted/i.test(m);
}

/** Converte erros do Postgres/Supabase em uma frase legível. */
export function mensagemErro(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Sem conexão com a internet.';
  if (/Timeout|timed out|AbortError|aborted/i.test(msg)) return 'O servidor demorou a responder. Confira a internet e tente de novo.';
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/duplicate key.*produtos_codigo|tipo_id, seq/i.test(msg)) return 'Já existe um produto com esse código.';
  if (/duplicate key.*codigo_barras/i.test(msg)) return 'Esse código de barras já está em outro produto.';
  if (/duplicate key.*produto_id, nome/i.test(msg)) return 'Já existe uma variação com esse nome neste produto.';
  return msg;
}
