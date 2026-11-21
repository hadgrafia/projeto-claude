import { chaveIp, conferirSenha, criarSessao, EMAIL, excedeu, hashSenha, lerCookie, lerSessao, problemaNaSenha, zerarTentativas, aleatorio, COOKIE } from '../../auth';
import { json, sha256, type Env } from '../../tipos';

/**
 * Conta do app (rotas públicas, cada uma com limite de tentativas):
 *  GET  /api/conta/estado     se há sessão aberta
 *  POST /api/conta/entrar     { email, senha }  abre a sessão
 *  POST /api/conta/cadastro   { email, senha }  cria a conta OU troca a senha; a conta só
 *                             passa a valer depois de confirmar o e-mail com o código do
 *                             Cloudflare Access (que só envia código para convidados)
 *  POST /api/conta/sair       encerra a sessão deste aparelho
 */
const MINUTO = 60_000;
// Hash falso para gastar o mesmo tempo quando o e-mail não tem conta (não revela quem tem).
const HASH_FALSO = 'pbkdf2$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';

async function corpo(request: Request) {
  const c = (await request.json().catch(() => ({}))) as { email?: unknown; senha?: unknown };
  return { email: String(c.email ?? '').trim().toLowerCase().slice(0, 254), senha: String(c.senha ?? '') };
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const [acao] = (params.rota as string[] | undefined) ?? [];

  if (acao === 'estado' && request.method === 'GET') {
    const s = await lerSessao(env, request);
    return json({ logado: Boolean(s.email) });
  }

  if (acao === 'entrar' && request.method === 'POST') {
    const { email, senha } = await corpo(request);
    if (!EMAIL.test(email) || !senha) return json({ erro: 'Digite seu e-mail e sua senha.' }, 400);
    const ip = await chaveIp(request);
    if (await excedeu(env, ip, 30, 15 * MINUTO)) return json({ erro: 'Muitas tentativas. Espere 15 minutos e tente de novo.' }, 429);
    if (await excedeu(env, `email:${email}`, 6, 15 * MINUTO, false)) return json({ erro: 'Muitas tentativas para este e-mail. Espere 15 minutos ou toque em "Esqueci minha senha".' }, 429);
    const conta = await env.DB.prepare('SELECT senha FROM contas WHERE email = ?').bind(email).first<{ senha: string }>();
    const ok = await conferirSenha(senha, conta?.senha ?? HASH_FALSO);
    if (!conta || !ok) {
      await excedeu(env, `email:${email}`, 6, 15 * MINUTO);
      return json({ erro: 'E-mail ou senha incorretos. Se ainda não tem conta, toque em "Criar conta".' }, 401);
    }
    await zerarTentativas(env, `email:${email}`);
    return json({ ok: true }, 200, await criarSessao(env, email));
  }

  if (acao === 'cadastro' && request.method === 'POST') {
    const { email, senha } = await corpo(request);
    if (!EMAIL.test(email)) return json({ erro: 'Digite um e-mail válido.' }, 400);
    const problema = problemaNaSenha(senha, email);
    if (problema) return json({ erro: problema }, 400);
    if (await excedeu(env, `cad:${await chaveIp(request)}`, 8, 60 * MINUTO)) return json({ erro: 'Muitos cadastros seguidos. Espere uma hora e tente de novo.' }, 429);
    const token = aleatorio();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM cadastros WHERE expira < ? OR email = ?').bind(Date.now(), email),
      env.DB.prepare('INSERT INTO cadastros (hash, email, senha, expira) VALUES (?, ?, ?, ?)').bind(await sha256(token), email, await hashSenha(senha), Date.now() + 30 * MINUTO),
    ]);
    return json({ ok: true, confirmar: `/conta/confirmar?t=${token}` });
  }

  if (acao === 'sair' && request.method === 'POST') {
    const token = lerCookie(request);
    if (token) await env.DB.prepare('DELETE FROM sessoes WHERE hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
  }

  return json({ erro: 'Rota não encontrada.' }, 404);
};
