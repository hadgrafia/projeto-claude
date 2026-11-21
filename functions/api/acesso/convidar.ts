import { emailAccess, json, type Env } from '../../tipos';

/**
 * Libera o e-mail de um familiar no Cloudflare Access para ele conseguir abrir o app.
 * Só quem já entrou pelo Access pode convidar, no máximo 5 pessoas (a administradora não tem limite).
 * O token usado aqui só tem permissão de editar grupos do Access.
 */
const LIMITE = 5;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const quem = emailAccess(request);
  if (!quem) return json({ erro: 'Entre no app pelo Cloudflare Access para convidar.' }, 401);
  if (!env.CF_ACCESS_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_ACCESS_GROUP_ID) return json({ erro: 'Convites automáticos ainda não foram configurados.' }, 503);
  const { email } = (await request.json().catch(() => ({}))) as { email?: string };
  const novo = String(email ?? '').trim().toLowerCase();
  if (!EMAIL.test(novo)) return json({ erro: 'E-mail inválido.' }, 400);

  const ja = await env.DB.prepare('SELECT email FROM acessos WHERE email = ?').bind(novo).first();
  if (ja) return json({ ok: true, jaTinha: true });
  const admin = (env.ADMIN_EMAIL ?? '').toLowerCase();
  if (quem !== admin) {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM acessos WHERE convidado_por = ?').bind(quem).first<{ n: number }>();
    if ((n?.n ?? 0) >= LIMITE) return json({ erro: `Você já convidou ${LIMITE} pessoas. Fale com a administradora do app.` }, 429);
  }

  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/groups/${env.CF_ACCESS_GROUP_ID}`;
  const cab = { Authorization: `Bearer ${env.CF_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };
  const g = (await (await fetch(base, { headers: cab })).json()) as { success: boolean; result?: { name: string; include: unknown[] } };
  if (!g.success || !g.result) return json({ erro: 'Não foi possível ler a lista de convidados.' }, 502);
  const include = [...g.result.include, { email: { email: novo } }];
  const r = (await (await fetch(base, { method: 'PUT', headers: cab, body: JSON.stringify({ name: g.result.name, include }) })).json()) as { success: boolean };
  if (!r.success) return json({ erro: 'Não foi possível liberar o e-mail.' }, 502);
  await env.DB.prepare('INSERT INTO acessos (email, convidado_por, em) VALUES (?, ?, ?)').bind(novo, quem, Date.now()).run();
  return json({ ok: true }, 201);
};
