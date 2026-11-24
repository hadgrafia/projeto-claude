import { json, quemEsta, sha256, type Env } from '../tipos';

/**
 * Estatística anônima de uso.
 *  POST /api/uso { recursos: string[] }  (qualquer conta) soma +1 em cada recurso usado hoje
 *  GET  /api/uso                         (só a administradora) totais dos últimos 30 dias
 * Não guarda e-mail, nem o que a pessoa fez, nem valores: só "N contas usaram X no dia D".
 */
const RECURSO = /^[a-z0-9:_-]{2,40}$/;
const MAX_RECURSOS = 60;

export const onRequest: PagesFunction<Env> = async ({ request, env, data }) => {
  const email = quemEsta(data);
  if (!email) return json({ erro: 'Entre com sua conta.', sessao: true }, 401);
  const hoje = new Date().toISOString().slice(0, 10);

  if (request.method === 'POST') {
    const c = (await request.json().catch(() => ({}))) as { recursos?: unknown };
    const recursos = [...new Set((Array.isArray(c.recursos) ? c.recursos : []).map(String).filter((r) => RECURSO.test(r)))].slice(0, MAX_RECURSOS);
    if (!recursos.length) return json({ ok: true });
    // Código do dia: muda todo dia e depende de um segredo do servidor (não dá para descobrir quem é).
    const marca = (await sha256(`${email}|${hoje}|${env.DADOS_CHAVE ?? env.VERIFICACAO ?? 'uso'}`)).slice(0, 24);
    const todos = ['ativo', ...recursos];
    await env.DB.batch([
      env.DB.prepare('DELETE FROM uso_marcas WHERE dia < ?').bind(new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10)),
      ...todos.flatMap((r) => [
        // Conta +1 só se esta conta ainda não tinha contado este recurso hoje.
        env.DB.prepare(
          'INSERT INTO uso_agregado (dia, recurso, contas) SELECT ?, ?, 1 WHERE NOT EXISTS (SELECT 1 FROM uso_marcas WHERE dia = ? AND marca = ? AND recurso = ?) ON CONFLICT(dia, recurso) DO UPDATE SET contas = contas + 1',
        ).bind(hoje, r, hoje, marca, r),
        env.DB.prepare('INSERT OR IGNORE INTO uso_marcas (dia, marca, recurso) VALUES (?, ?, ?)').bind(hoje, marca, r),
      ]),
    ]);
    return json({ ok: true });
  }

  if (request.method === 'GET') {
    if (email !== (env.ADMIN_EMAIL ?? '').toLowerCase()) return json({ erro: 'Rota não encontrada.' }, 404);
    const dias = Math.min(90, Math.max(7, Number(new URL(request.url).searchParams.get('dias')) || 30));
    const desde = new Date(Date.now() - (dias - 1) * 864e5).toISOString().slice(0, 10);
    const { results } = await env.DB.prepare('SELECT recurso, SUM(contas) AS total, COUNT(*) AS diasComUso FROM uso_agregado WHERE dia >= ? GROUP BY recurso').bind(desde).all<{ recurso: string; total: number; diasComUso: number }>();
    const porDia = await env.DB.prepare("SELECT dia, contas FROM uso_agregado WHERE recurso = 'ativo' AND dia >= ? ORDER BY dia").bind(desde).all<{ dia: string; contas: number }>();
    const contas = await env.DB.prepare('SELECT COUNT(*) AS n FROM contas').first<{ n: number }>();
    const novas = await env.DB.prepare('SELECT COUNT(*) AS n FROM contas WHERE criada_em >= ?').bind(Date.now() - dias * 864e5).first<{ n: number }>();
    const pendentes = await env.DB.prepare("SELECT COUNT(*) AS n FROM pedidos WHERE status = 'pendente'").first<{ n: number }>();
    return json({ dias, contas: contas?.n ?? 0, contasNovas: novas?.n ?? 0, pedidosPendentes: pendentes?.n ?? 0, recursos: results, ativosPorDia: porDia.results });
  }
  return json({ erro: 'Rota não encontrada.' }, 404);
};
