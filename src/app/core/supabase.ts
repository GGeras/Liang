import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export const supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'liang-auth' },
});

/** Converte erros do Postgres/Supabase em uma frase legível. */
export function mensagemErro(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Sem conexão com a internet.';
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/duplicate key.*produtos_codigo|tipo_id, seq/i.test(msg)) return 'Já existe um produto com esse código.';
  if (/duplicate key.*codigo_barras/i.test(msg)) return 'Esse código de barras já está em outro produto.';
  if (/duplicate key.*produto_id, nome/i.test(msg)) return 'Já existe uma variação com esse nome neste produto.';
  return msg;
}
