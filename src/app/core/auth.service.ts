import { Injectable, computed, signal } from '@angular/core';
import { supabase } from './supabase';
import { Perfil } from './models';
import { ler, salvar, apagar } from './cofre';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly perfil = signal<Perfil | null>(null);
  readonly isAdmin = computed(() => this.perfil()?.papel === 'admin');
  private pronto: Promise<void>;

  constructor() {
    this.pronto = this.carregar();
    supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') this.perfil.set(null);
    });
  }

  /** Resolve quando a sessão (online ou do cache) já foi verificada. */
  aguardar() {
    return this.pronto;
  }

  private async carregar() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    // Sem internet: usa o perfil guardado no aparelho
    const cache = await ler<Perfil | null>('perfil', null);
    if (cache?.id === data.session.user.id) this.perfil.set(cache);
    await this.atualizarPerfil(data.session.user.id);
  }

  private async atualizarPerfil(id: string) {
    const { data, error } = await supabase
      .from('perfis')
      .select('id, nome, papel, ativo')
      .eq('id', id)
      .single();
    if (error || !data) return;
    if (!data.ativo) {
      await this.sair();
      throw new Error('Seu acesso foi desativado. Fale com um administrador.');
    }
    this.perfil.set(data as Perfil);
    await salvar('perfil', data);
  }

  async entrar(email: string, senha: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
    await this.atualizarPerfil(data.user.id);
    if (!this.perfil()) throw new Error('Perfil não encontrado. Fale com um administrador.');
  }

  async sair() {
    await supabase.auth.signOut({ scope: 'local' });
    await apagar('perfil');
    this.perfil.set(null);
  }
}
