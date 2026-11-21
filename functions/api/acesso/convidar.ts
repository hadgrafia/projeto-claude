import { criarConvite, EMAIL } from '../../auth';
import { json, quemEsta, type Env } from '../../tipos';

/**
 * Convite pessoal para criar conta no app. Quem já usa o app pode convidar até 5 pessoas
 * (para planos em conjunto); a administradora não tem limite.
 *  POST /api/acesso/convidar  { email, tipo?: 'conta' | 'senha' }  → { link } ou { jaTemConta }
 * Link de senha nova ('senha') só a administradora gera.
 */
const LIMITE = 5;

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const quem = quemEsta(data);
  if (!quem) return json({ erro: 'Entre no app com sua conta para convidar.', sessao: true }, 401);
  const c = (await request.json().catch(() => ({}))) as { email?: string; tipo?: string };
  const novo = String(c.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(novo)) return json({ erro: 'E-mail inválido.' }, 400);
  const admin = quem === (env.ADMIN_EMAIL ?? '').toLowerCase();
  const tipo = c.tipo === 'senha' ? 'senha' : 'conta';
  if (tipo === 'senha' && !admin) return json({ erro: 'Só a administradora gera links de senha nova.' }, 403);

  const temConta = await env.DB.prepare('SELECT 1 AS x FROM contas WHERE email = ?').bind(novo).first();
  if (tipo === 'conta' && temConta) return json({ ok: true, jaTemConta: true });
  if (tipo === 'senha' && !temConta) return json({ erro: 'Este e-mail ainda não tem conta: envie um convite.' }, 404);

  if (!admin) {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM acessos WHERE convidado_por = ?').bind(quem).first<{ n: number }>();
    if ((n?.n ?? 0) >= LIMITE) return json({ erro: `Você já convidou ${LIMITE} pessoas. Fale com a administradora do app.` }, 429);
    await env.DB.prepare('INSERT OR IGNORE INTO acessos (email, convidado_por, em) VALUES (?, ?, ?)').bind(novo, quem, Date.now()).run();
  }
  const link = await criarConvite(env, novo, tipo, quem, new URL(request.url).origin);
  return json({ ok: true, link }, 201);
};
