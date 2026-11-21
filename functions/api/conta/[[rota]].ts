import { chaveIp, conferirSenha, criarSessao, EMAIL, excedeu, hashSenha, lerCookie, lerConvite, lerSessao, problemaNaSenha, zerarTentativas, COOKIE } from '../../auth';
import { json, sha256, type Env } from '../../tipos';

/**
 * Conta do app (rotas públicas, cada uma com limite de tentativas):
 *  GET  /api/conta/estado          se há sessão aberta
 *  GET  /api/conta/convite?t=…     e-mail do convite (ou do link de senha nova), se ainda vale
 *  POST /api/conta/entrar          { email, senha }  abre a sessão
 *  POST /api/conta/cadastro        { convite, senha } cria a conta (ou a senha nova) pelo link pessoal
 *  POST /api/conta/senha           { atual, nova }   troca a senha de quem está logado
 *  POST /api/conta/sair            encerra a sessão deste aparelho
 */
const MINUTO = 60_000;
// Hash falso para gastar o mesmo tempo quando o e-mail não tem conta (não revela quem tem).
const HASH_FALSO = 'pbkdf2$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';

const ler = async (request: Request) => (await request.json().catch(() => ({}))) as Record<string, unknown>;
const texto = (v: unknown, max = 254) => String(v ?? '').slice(0, max);

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const [acao] = (params.rota as string[] | undefined) ?? [];
  const ip = await chaveIp(request);

  if (acao === 'estado' && request.method === 'GET') {
    const s = await lerSessao(env, request);
    return json({ logado: Boolean(s.email) });
  }

  if (acao === 'convite' && request.method === 'GET') {
    if (await excedeu(env, `conv:${ip}`, 40, 15 * MINUTO)) return json({ erro: 'Muitas tentativas. Espere 15 minutos.' }, 429);
    const c = await lerConvite(env, new URL(request.url).searchParams.get('t') ?? '');
    if (!c) return json({ erro: 'Este link não vale mais: ele já foi usado ou passou do prazo. Peça um novo a quem te convidou.' }, 404);
    return json({ email: c.email, tipo: c.tipo });
  }

  if (acao === 'entrar' && request.method === 'POST') {
    const c = await ler(request);
    const email = texto(c.email).trim().toLowerCase();
    const senha = texto(c.senha, 200);
    if (!EMAIL.test(email) || !senha) return json({ erro: 'Digite seu e-mail e sua senha.' }, 400);
    if (await excedeu(env, ip, 30, 15 * MINUTO)) return json({ erro: 'Muitas tentativas. Espere 15 minutos e tente de novo.' }, 429);
    if (await excedeu(env, `email:${email}`, 6, 15 * MINUTO, false)) return json({ erro: 'Muitas tentativas para este e-mail. Espere 15 minutos ou toque em "Esqueci minha senha".' }, 429);
    const conta = await env.DB.prepare('SELECT senha FROM contas WHERE email = ?').bind(email).first<{ senha: string }>();
    const ok = await conferirSenha(senha, conta?.senha ?? HASH_FALSO);
    if (!conta || !ok) {
      await excedeu(env, `email:${email}`, 6, 15 * MINUTO);
      return json({ erro: 'E-mail ou senha incorretos. Se ainda não criou sua conta, abra o link do convite que você recebeu por e-mail.' }, 401);
    }
    await zerarTentativas(env, `email:${email}`);
    return json({ ok: true }, 200, await criarSessao(env, email));
  }

  if (acao === 'cadastro' && request.method === 'POST') {
    if (await excedeu(env, `cad:${ip}`, 10, 60 * MINUTO)) return json({ erro: 'Muitas tentativas seguidas. Espere uma hora e tente de novo.' }, 429);
    const c = await ler(request);
    const token = texto(c.convite, 100);
    const senha = texto(c.senha, 200);
    const convite = await lerConvite(env, token);
    if (!convite) return json({ erro: 'Este link não vale mais: ele já foi usado ou passou do prazo. Peça um novo a quem te convidou.' }, 404);
    const problema = problemaNaSenha(senha, convite.email);
    if (problema) return json({ erro: problema }, 400);
    const agora = Date.now();
    await env.DB.batch([
      // O link é de uso único: some assim que é usado (junto com outros links do mesmo e-mail).
      env.DB.prepare('DELETE FROM convites_conta WHERE email = ?').bind(convite.email),
      env.DB.prepare('INSERT INTO contas (email, senha, criada_em, atualizada_em) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET senha = excluded.senha, atualizada_em = excluded.atualizada_em').bind(
        convite.email,
        await hashSenha(senha),
        agora,
        agora,
      ),
      // Senha nova: encerra as sessões antigas em todos os aparelhos.
      env.DB.prepare('DELETE FROM sessoes WHERE email = ?').bind(convite.email),
      env.DB.prepare('DELETE FROM tentativas WHERE chave = ?').bind(`email:${convite.email}`),
      env.DB.prepare('INSERT OR IGNORE INTO acessos (email, convidado_por, em) VALUES (?, ?, ?)').bind(convite.email, 'convite', agora),
    ]);
    return json({ ok: true, email: convite.email }, 200, await criarSessao(env, convite.email));
  }

  if (acao === 'senha' && request.method === 'POST') {
    const s = await lerSessao(env, request);
    if (!s.email) return json({ erro: 'Sua sessão expirou. Entre de novo.', sessao: true }, 401);
    if (await excedeu(env, `email:${s.email}`, 6, 15 * MINUTO, false)) return json({ erro: 'Muitas tentativas. Espere 15 minutos.' }, 429);
    const c = await ler(request);
    const conta = await env.DB.prepare('SELECT senha FROM contas WHERE email = ?').bind(s.email).first<{ senha: string }>();
    if (!conta || !(await conferirSenha(texto(c.atual, 200), conta.senha))) {
      await excedeu(env, `email:${s.email}`, 6, 15 * MINUTO);
      return json({ erro: 'A senha atual não confere.' }, 400);
    }
    const nova = texto(c.nova, 200);
    const problema = problemaNaSenha(nova, s.email);
    if (problema) return json({ erro: problema }, 400);
    const token = lerCookie(request)!;
    await env.DB.batch([
      env.DB.prepare('UPDATE contas SET senha = ?, atualizada_em = ? WHERE email = ?').bind(await hashSenha(nova), Date.now(), s.email),
      // Mantém este aparelho conectado e desconecta os outros.
      env.DB.prepare('DELETE FROM sessoes WHERE email = ? AND hash != ?').bind(s.email, await sha256(token)),
    ]);
    return json({ ok: true });
  }

  if (acao === 'sair' && request.method === 'POST') {
    const token = lerCookie(request);
    if (token) await env.DB.prepare('DELETE FROM sessoes WHERE hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
  }

  return json({ erro: 'Rota não encontrada.' }, 404);
};
