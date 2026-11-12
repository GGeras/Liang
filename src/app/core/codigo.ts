/**
 * Códigos dos registros, para consultar (Mais › Consultar código):
 * - Venda: os 8 primeiros caracteres do id, o "Venda nº" da notinha (ex.: C0A1B2C3).
 *   O cancelamento e a ocorrência de venda recusada usam o número da própria venda.
 * - Movimentação (entrada, venda, ajuste, cancelamento): "M" + id (ex.: M1542).
 */
export const codigoVenda = (id: string) => id.slice(0, 8).toUpperCase();
export const codigoMov = (id: number) => `M${id}`;

export const NOME_MOV: Record<string, string> = {
  entrada: 'Entrada',
  venda: 'Venda',
  ajuste: 'Ajuste',
  cancelamento: 'Cancelamento',
};

export interface CodigoLido {
  /** Começo do id de venda, só hexadecimal e minúsculo (4 a 32 caracteres). */
  venda: string | null;
  /** Id de movimentação. */
  mov: number | null;
}

/**
 * O que a pessoa digitou → onde procurar. Aceita "nº C0A1B2C3", "c0a1 b2c3", "M1542", "m-1542".
 * Só números (ex.: 1542) pode ser tanto começo de venda quanto movimentação: procura nos dois.
 */
export function lerCodigo(texto: string): CodigoLido {
  const t = texto
    .trim()
    .toUpperCase()
    .replace(/^(VENDA\s*)?(N\s*[º°O.]+|#)\s*/, '')
    .replace(/\s+/g, '');
  const m = /^M-?(\d{1,12})$/.exec(t);
  if (m) return { venda: null, mov: Number(m[1]) };
  const hex = t.replace(/-/g, '');
  return {
    venda: /^[0-9A-F]{4,32}$/.test(hex) ? hex.toLowerCase() : null,
    mov: /^\d{1,12}$/.test(t) ? Number(t) : null,
  };
}

const comHifens = (h: string) => [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].filter(Boolean).join('-');

/** Faixa de uuids que começam com o prefixo (o Postgres ordena uuid na mesma ordem do texto). */
export function faixaUuid(prefixo: string): [string, string] {
  return [comHifens(prefixo.padEnd(32, '0')), comHifens(prefixo.padEnd(32, 'f'))];
}

/** Prefixo no formato do uuid em texto (com hífens), para comparar com texto guardado em JSON. */
export const prefixoUuid = comHifens;
