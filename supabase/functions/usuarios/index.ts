// Liang — gestão de usuários (somente administradores)
// Ações: { acao: 'criar', email, senha, nome, papel } | { acao: 'senha', id, senha }
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // Quem está chamando?
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: quem, error: errQuem } = await service.auth.getUser(token);
  if (errQuem || !quem.user) return json({ erro: 'Não autenticado' }, 401);

  const { data: perfil } = await service.from('perfis').select('papel, ativo').eq('id', quem.user.id).single();
  if (!perfil || perfil.papel !== 'admin' || !perfil.ativo) return json({ erro: 'Apenas administradores' }, 403);

  const corpo = await req.json().catch(() => ({}));
  // Senha: 8 a 72 caracteres (72 é o limite do bcrypt usado pelo Auth)
  const senhaValida = (s: unknown) => typeof s === 'string' && s.length >= 8 && s.length <= 72;

  if (corpo.acao === 'criar') {
    const { email, senha, nome, papel } = corpo;
    if (!email || !senha || !nome) return json({ erro: 'Informe nome, e-mail e senha' }, 400);
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return json({ erro: 'E-mail inválido' }, 400);
    }
    if (typeof nome !== 'string' || !nome.trim() || nome.trim().length > 80) return json({ erro: 'Nome inválido (até 80 caracteres)' }, 400);
    if (!senhaValida(senha)) return json({ erro: 'A senha precisa ter de 8 a 72 caracteres' }, 400);
    if (!['admin', 'vendedor'].includes(papel)) return json({ erro: 'Perfil inválido' }, 400);
    const { data, error } = await service.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password: String(senha),
      email_confirm: true,
      user_metadata: { nome: String(nome).trim() },
      // Só o servidor grava app_metadata: é daqui que o banco tira o papel e libera o acesso
      app_metadata: { criado_pelo_admin: true, papel, nome: String(nome).trim() },
    });
    if (error) return json({ erro: /already/i.test(error.message) ? 'Já existe um usuário com esse e-mail' : error.message }, 400);
    return json({ ok: true, id: data.user.id });
  }

  if (corpo.acao === 'senha') {
    const { id, senha } = corpo;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return json({ erro: 'Usuário inválido' }, 400);
    if (!senhaValida(senha)) return json({ erro: 'A senha precisa ter de 8 a 72 caracteres' }, 400);
    const { error } = await service.auth.admin.updateUserById(id, { password: String(senha) });
    if (error) return json({ erro: error.message }, 400);
    return json({ ok: true });
  }

  return json({ erro: 'Ação desconhecida' }, 400);
});
