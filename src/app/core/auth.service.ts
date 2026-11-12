import { Injectable, computed, signal } from '@angular/core';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { erroDeRede, supabase } from './supabase';
import { Perfil } from './models';
import { ler, salvar, apagar } from './cofre';

/** Usuário da sessão guardada no aparelho (sem validar no servidor). */
function usuarioGuardado(): string | undefined {
  try {
    const s = JSON.parse(localStorage.getItem('liang-auth') ?? 'null') as { user?: { id?: string } } | null;
    return s?.user?.id;
  } catch {
    return undefined;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly perfil = signal<Perfil | null>(null);
  readonly isAdmin = computed(() => this.perfil()?.papel === 'admin');
  /** Motivo de ter voltado para a tela de entrar (acesso desativado, sessão vencida). */
  readonly aviso = signal('');
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
    // Sem internet e com o token vencido (app parado por mais de 1 h), a renovação
    // fica tentando por ~30 s e depois devolve a sessão vazia, embora ela continue
    // guardada no aparelho. O app não espera por isso: segue logado com o perfil do
    // cache e vende offline. Ao reconectar, a sessão é renovada sozinha.
    const limite = new Promise<null>((ok) => setTimeout(() => ok(null), navigator.onLine ? 5000 : 0));
    const r = await Promise.race([supabase.auth.getSession(), limite]);
    const semRede = !r || (!!r.error && (isAuthRetryableFetchError(r.error) || erroDeRede(r.error)));
    const uid = r?.data.session?.user.id ?? (semRede ? usuarioGuardado() : undefined);
    if (!uid) return;
    // Sem internet: usa o perfil guardado no aparelho
    const cache = await ler<Perfil | null>('perfil', null);
    if (cache?.id === uid) this.perfil.set(cache);
    // Não deixa a inicialização falhar: os guards mandam para /entrar com o aviso
    const atualizar = this.atualizarPerfil(uid).catch((e) => this.aviso.set((e as Error).message));
    // Com internet, espera o perfil do servidor (papel e acesso atualizados). Sem
    // rede, abre já com o do aparelho; a conferência termina quando a rede voltar
    // (acesso desativado: sai e volta para Entrar)
    if (!this.perfil() || !semRede) await atualizar;
  }

  private async atualizarPerfil(id: string) {
    const { data, error } = await supabase
      .from('perfis')
      .select('id, nome, papel, ativo')
      .eq('id', id)
      .single();
    // Sessão recusada pelo servidor (token revogado/vencido sem renovação): sair de verdade.
    // Sem internet o erro é de rede e o perfil do cache continua valendo.
    if (error && /JWT|PGRST30[0-3]|401/i.test(`${error.code} ${error.message}`)) {
      await this.sair();
      throw new Error('Sua sessão expirou. Entre novamente.');
    }
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
