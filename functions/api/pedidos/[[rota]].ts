import { criarConvite } from '../../auth';
import { json, quemEsta, type Env } from '../../tipos';

/**
 * Pedidos de convite: só a administradora (ADMIN_EMAIL, logada com a conta) vê e decide.
 *  GET  /api/pedidos            lista os pendentes
 *  POST /api/pedidos/:id        { acao: 'aprovar' | 'recusar' }
 * Aprovar cria o convite pessoal (link de uso único) para a pessoa criar a conta.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env, params, data }) => {
  const quem = quemEsta(data);
  if (!quem || quem !== (env.ADMIN_EMAIL ?? '').toLowerCase()) return json({ erro: 'Só a administradora pode ver os pedidos.' }, 403);
  const [id] = (params.rota as string[] | undefined) ?? [];

  if (!id && request.method === 'GET') {
    const { results } = await env.DB.prepare("SELECT id, nome, email, mensagem, criado_em FROM pedidos WHERE status = 'pendente' ORDER BY criado_em").all();
    return json({ pedidos: results, convitesAutomaticos: true });
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
    // Aprovar = criar o convite pessoal (link de uso único) para a pessoa criar a conta.
    const link = await criarConvite(env, p.email, 'conta', quem, new URL(request.url).origin);
    await env.DB.batch([
      env.DB.prepare("UPDATE pedidos SET status = 'aprovado' WHERE id = ?").bind(id),
      env.DB.prepare('INSERT OR IGNORE INTO acessos (email, convidado_por, em) VALUES (?, ?, ?)').bind(p.email, quem, Date.now()),
    ]);
    return json({ ok: true, email: p.email, link });
  }
  return json({ erro: 'Rota não encontrada.' }, 404);
};
