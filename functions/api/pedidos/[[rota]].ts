import { emailAccess, json, type Env } from '../../tipos';

/**
 * Pedidos de convite: só a administradora (ADMIN_EMAIL, confirmado pelo Cloudflare Access) vê e decide.
 *  GET  /api/pedidos            lista os pendentes
 *  POST /api/pedidos/:id        { acao: 'aprovar' | 'recusar' }
 * Aprovar libera o e-mail no grupo de convidados do Access (precisa de CF_ACCESS_TOKEN).
 */
export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const quem = emailAccess(request);
  if (!quem || quem !== (env.ADMIN_EMAIL ?? '').toLowerCase()) return json({ erro: 'Só a administradora pode ver os pedidos.' }, 403);
  const [id] = (params.rota as string[] | undefined) ?? [];

  if (!id && request.method === 'GET') {
    const { results } = await env.DB.prepare("SELECT id, nome, email, mensagem, criado_em FROM pedidos WHERE status = 'pendente' ORDER BY criado_em").all();
    return json({ pedidos: results, convitesAutomaticos: Boolean(env.CF_ACCESS_TOKEN && env.CF_ACCESS_GROUP_ID) });
  }
  if (id && request.method === 'POST') {
    const { acao } = (await request.json().catch(() => ({}))) as { acao?: string };
    const p = await env.DB.prepare("SELECT email FROM pedidos WHERE id = ? AND status = 'pendente'").bind(id).first<{ email: string }>();
    if (!p) return json({ erro: 'Pedido não encontrado.' }, 404);
    if (acao === 'recusar') {
      await env.DB.prepare("UPDATE pedidos SET status = 'recusado' WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
    if (acao !== 'aprovar') return json({ erro: 'Ação inválida.' }, 400);
    if (!env.CF_ACCESS_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_ACCESS_GROUP_ID) return json({ erro: 'Convites automáticos desligados: peça ao Claude para liberar este e-mail.' }, 503);
    const base = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/groups/${env.CF_ACCESS_GROUP_ID}`;
    const cab = { Authorization: `Bearer ${env.CF_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };
    const g = (await (await fetch(base, { headers: cab })).json()) as { success: boolean; result?: { name: string; include: { email?: { email: string } }[] } };
    if (!g.success || !g.result) return json({ erro: 'Não foi possível ler a lista de convidados.' }, 502);
    if (!g.result.include.some((i) => i.email?.email?.toLowerCase() === p.email)) {
      const r = (await (await fetch(base, { method: 'PUT', headers: cab, body: JSON.stringify({ name: g.result.name, include: [...g.result.include, { email: { email: p.email } }] }) })).json()) as { success: boolean };
      if (!r.success) return json({ erro: 'Não foi possível liberar o e-mail.' }, 502);
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE pedidos SET status = 'aprovado' WHERE id = ?").bind(id),
      env.DB.prepare('INSERT OR IGNORE INTO acessos (email, convidado_por, em) VALUES (?, ?, ?)').bind(p.email, quem, Date.now()),
    ]);
    return json({ ok: true, email: p.email });
  }
  return json({ erro: 'Rota não encontrada.' }, 404);
};
