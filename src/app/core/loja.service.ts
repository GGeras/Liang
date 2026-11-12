import { Injectable, signal } from '@angular/core';
import { supabase } from './supabase';
import { DadosLoja, LOJA_PADRAO } from './models';
import { ler, salvar } from './cofre';

const CAMPOS = 'nome, cnpj, endereco, telefone, rodape';

/**
 * Dados da loja que vão no cabeçalho e no rodapé da notinha.
 * Ficam guardados no aparelho: a notinha sai mesmo sem internet.
 */
@Injectable({ providedIn: 'root' })
export class LojaService {
  readonly dados = signal<DadosLoja>(LOJA_PADRAO);
  private iniciado = false;

  async iniciar() {
    if (this.iniciado) return;
    this.iniciado = true;
    const cache = await ler<DadosLoja | null>('loja', null);
    if (cache) this.dados.set(cache);
    addEventListener('online', () => this.atualizar());
    await this.atualizar();
  }

  /** Busca no servidor; sem internet (ou com erro) continua valendo o que está no aparelho. */
  async atualizar(): Promise<void> {
    if (!navigator.onLine) return;
    const { data, error } = await supabase.from('loja').select(CAMPOS).maybeSingle();
    if (error || !data) return;
    this.dados.set(data as DadosLoja);
    await salvar('loja', data);
  }

  /** Só o admin consegue (RLS); o banco registra quem alterou e quando. */
  async gravar(d: DadosLoja): Promise<void> {
    const limpo: DadosLoja = {
      nome: d.nome.trim(),
      cnpj: d.cnpj?.trim() || null,
      endereco: d.endereco.trim(),
      telefone: d.telefone.trim(),
      rodape: d.rodape.trim(),
    };
    const { data, error } = await supabase.from('loja').update(limpo).eq('id', true).select(CAMPOS).single();
    if (error) throw error;
    this.dados.set(data as DadosLoja);
    await salvar('loja', data);
  }
}
