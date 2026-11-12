import { Component, Injectable, Pipe, PipeTransform, input, signal } from '@angular/core';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

export const formatarBRL = (v: number | string | null | undefined) => brl.format(Number(v ?? 0));

@Pipe({ name: 'brl' })
export class BrlPipe implements PipeTransform {
  transform(v: number | string | null | undefined) {
    return formatarBRL(v);
  }
}

const inteiro = new Intl.NumberFormat('pt-BR');

/** Contagens com separador de milhar: 1.023 vendas. */
@Pipe({ name: 'int' })
export class IntPipe implements PipeTransform {
  transform(v: number | string | null | undefined) {
    return inteiro.format(Number(v ?? 0));
  }
}

@Pipe({ name: 'dataHora' })
export class DataHoraPipe implements PipeTransform {
  transform(v: string | null | undefined) {
    return v ? dataHora.format(new Date(v)) : '';
  }
}

/** Ícones de traço, desenhados à mão para o app. */
const ICONES: Record<string, string> = {
  vender: 'M4 7h16l-1.5 9.5a2 2 0 0 1-2 1.5h-9a2 2 0 0 1-2-1.5zM8 7a4 4 0 0 1 8 0',
  catalogo: 'M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z',
  historico: 'M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v4h4',
  painel: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  estoque: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
  mais: 'M5 12h.01M12 12h.01M19 12h.01',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10',
  fechar: 'M6 6l12 12M18 6L6 18',
  mais1: 'M12 5v14M5 12h14',
  menos: 'M5 12h14',
  voltar: 'M15 18l-6-6 6-6',
  apagar: 'M9 4h6M4 7h16M6 7l1 13h10l1-13',
  nuvem: 'M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11 3.5 3.5 0 0 0 7 18z',
  sem_nuvem: 'M3 3l18 18M7 18h10M17.6 10.05A6 6 0 0 0 9 6.6M6.1 11A3.5 3.5 0 0 0 7 18',
  sair: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11',
  alerta: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  editar: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  usuarios: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  baixar: 'M12 4v12M6 10l6 6 6-6M4 20h16',
  check: 'M5 12l5 5L20 7',
  imprimir: 'M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 13h10v8H7z',
  regua: 'M3 15 15 3l6 6L9 21zM7 11l2 2M10 8l2 2M13 5l2 2',
  ajustar: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  loja: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6',
};

@Component({
  selector: 'i-con',
  template: `<svg class="svg-i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="d()" /></svg>`,
  host: { style: 'display:inline-flex' },
})
export class Icone {
  readonly nome = input.required<string>();
  d() {
    return ICONES[this.nome()] ?? '';
  }
}

/** Texto de identificação do item: o 00-00 ou, se não houver, o código de barras. */
export function identTexto(codigo: string | null | undefined, barras: string | null | undefined): string {
  return codigo || barras || '';
}

/**
 * Identificação do produto: OU a etiqueta amarela 00-00 (produto sem código de barras),
 * OU o código de barras do item. Nunca os dois.
 */
@Component({
  selector: 'app-ident',
  template: `
    @if (codigo()) {
      <span class="etiqueta">{{ codigo() }}</span>
    } @else if (barras()) {
      <span class="barras-id num"><span class="sr-only">Código de barras </span>{{ barras() }}</span>
    }
  `,
  host: { style: 'display:inline-flex; flex: none' },
})
export class Ident {
  readonly codigo = input<string | null | undefined>();
  readonly barras = input<string | null | undefined>();
}

/** Avisos curtos no topo da tela. */
@Injectable({ providedIn: 'root' })
export class Toast {
  readonly atual = signal<{ texto: string; tipo: 'ok' | 'erro' | 'info' } | null>(null);
  private t?: ReturnType<typeof setTimeout>;
  mostrar(texto: string, tipo: 'ok' | 'erro' | 'info' = 'info', ms = 3500) {
    clearTimeout(this.t);
    this.atual.set({ texto, tipo });
    this.t = setTimeout(() => this.atual.set(null), ms);
  }
}

/** Gera CSV que o Excel em português abre direto (separador ; e BOM). */
export function baixarCsv(nome: string, linhas: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    let s = typeof v === 'number' ? String(v).replace('.', ',') : (v ?? '');
    // Injeção de fórmula: um nome de cliente como "=HIPERLINK(...)" viraria fórmula no Excel
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
