import { excedeu } from '../../auth';
import { cifrar, decifrar } from '../../cripto';
import { json, quemEsta, type Env } from '../../tipos';

/**
 * Atendimento com uma pessoa (dúvidas que as respostas prontas não resolvem).
 * Quem pergunta:
 *  GET  /api/suporte                  o próprio chamado (mensagens) e quantas respostas novas
 *  POST /api/suporte                  { texto, nome }  manda mensagem (abre o chamado se preciso)
 * Equipe (só a administradora; a pessoa vê apenas "uma pessoa da equipe"):
 *  GET  /api/suporte/equipe           lista de chamados (só o nome da pessoa)
 *  GET  /api/suporte/equipe/:id       mensagens do chamado
 *  POST /api/suporte/equipe/:id       { texto } responde  |  { fechar: true } encerra
 * Nome e mensagens ficam cifrados no banco.
 */
const MAX_TEXTO = 1500;
const ctx = (id: string) => `chamado:${id}`;
const novoId = () => crypto.randomUUID().replace(/-/g, '');

interface Chamado {
  id: string;
  email: string;
  nome: string;
  status: string;
  criado_em: number;
  atualizado_em: number;
  nao_lidas_equipe: number;
  nao_lidas_pessoa: number;
}

async function mensagens(env: Env, id: string) {
  const { results } = await env.DB.prepare('SELECT id, de, texto, em FROM mensagens_chamado WHERE chamado_id = ? ORDER BY em').bind(id).all<{ id: string; de: string; texto: string; em: number }>();
  return Promise.all(results.map(async (m) => ({ id: m.id, de: m.de, texto: await decifrar(env, m.texto, ctx(id)).catch(() => ''), em: m.em })));
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params, data }) => {
  const email = quemEsta(data);
  if (!email) return json({ erro: 'Entre com sua conta.', sessao: true }, 401);
  if (!env.DADOS_CHAVE) return json({ erro: 'O atendimento ainda não foi ativado no servidor.' }, 503);
  const [parte, id] = (params.rota as string[] | undefined) ?? [];
  const agora = Date.now();

  // ---------- Equipe ----------
  if (parte === 'equipe') {
    if (email !== (env.ADMIN_EMAIL ?? '').toLowerCase()) return json({ erro: 'Rota não encontrada.' }, 404);
    if (!id && request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM chamados ORDER BY (status = \'aberto\') DESC, atualizado_em DESC LIMIT 200').all<Chamado>();
      return json({
        chamados: await Promise.all(
          results.map(async (c) => ({ id: c.id, nome: await decifrar(env, c.nome, ctx(c.id)).catch(() => 'Pessoa'), status: c.status, atualizadoEm: c.atualizado_em, criadoEm: c.criado_em, naoLidas: c.nao_lidas_equipe })),
        ),
      });
    }
    if (!id || !/^[a-f0-9]{32}$/.test(id)) return json({ erro: 'Chamado inválido.' }, 400);
    const c = await env.DB.prepare('SELECT * FROM chamados WHERE id = ?').bind(id).first<Chamado>();
    if (!c) return json({ erro: 'Chamado não encontrado.' }, 404);
    if (request.method === 'GET') {
      await env.DB.prepare('UPDATE chamados SET nao_lidas_equipe = 0 WHERE id = ?').bind(id).run();
      return json({ id, nome: await decifrar(env, c.nome, ctx(id)).catch(() => 'Pessoa'), status: c.status, mensagens: await mensagens(env, id) });
    }
    if (request.method === 'POST') {
      const corpo = (await request.json().catch(() => ({}))) as { texto?: string; fechar?: boolean; reabrir?: boolean };
      if (corpo.fechar || corpo.reabrir) {
        await env.DB.prepare('UPDATE chamados SET status = ?, atualizado_em = ? WHERE id = ?').bind(corpo.fechar ? 'fechado' : 'aberto', agora, id).run();
        return json({ ok: true });
      }
      const texto = String(corpo.texto ?? '').trim().slice(0, MAX_TEXTO);
      if (!texto) return json({ erro: 'Escreva a resposta.' }, 400);
      await env.DB.batch([
        env.DB.prepare('INSERT INTO mensagens_chamado (id, chamado_id, de, texto, em) VALUES (?, ?, ?, ?, ?)').bind(novoId(), id, 'equipe', await cifrar(env, texto, ctx(id)), agora),
        env.DB.prepare("UPDATE chamados SET atualizado_em = ?, nao_lidas_pessoa = nao_lidas_pessoa + 1, nao_lidas_equipe = 0, status = 'aberto' WHERE id = ?").bind(agora, id),
      ]);
      return json({ ok: true });
    }
    return json({ erro: 'Rota não encontrada.' }, 404);
  }
  if (parte) return json({ erro: 'Rota não encontrada.' }, 404);

  // ---------- Quem pergunta ----------
  const atual = await env.DB.prepare('SELECT * FROM chamados WHERE email = ? ORDER BY atualizado_em DESC LIMIT 1').bind(email).first<Chamado>();
  if (request.method === 'GET') {
    if (!atual) return json({ chamado: null });
    const marcar = new URL(request.url).searchParams.get('lido') === '1';
    if (marcar && atual.nao_lidas_pessoa) await env.DB.prepare('UPDATE chamados SET nao_lidas_pessoa = 0 WHERE id = ?').bind(atual.id).run();
    return json({ chamado: { id: atual.id, status: atual.status, naoLidas: marcar ? 0 : atual.nao_lidas_pessoa, mensagens: marcar ? await mensagens(env, atual.id) : [] } });
  }
  if (request.method === 'POST') {
    if (await excedeu(env, `suporte:${email}`, 30, 3600_000)) return json({ erro: 'Muitas mensagens seguidas. Espere um pouco e tente de novo.' }, 429);
    const corpo = (await request.json().catch(() => ({}))) as { texto?: string; nome?: string };
    const texto = String(corpo.texto ?? '').trim().slice(0, MAX_TEXTO);
    if (!texto) return json({ erro: 'Escreva a sua dúvida.' }, 400);
    const nome = String(corpo.nome ?? '').trim().slice(0, 60) || email.split('@')[0];
    let cid = atual?.status === 'aberto' ? atual.id : '';
    const novo = !cid;
    if (novo) {
      cid = novoId();
      await env.DB.prepare('INSERT INTO chamados (id, email, nome, status, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)').bind(cid, email, await cifrar(env, nome, ctx(cid)), 'aberto', agora, agora).run();
    }
    await env.DB.batch([
      env.DB.prepare('INSERT INTO mensagens_chamado (id, chamado_id, de, texto, em) VALUES (?, ?, ?, ?, ?)').bind(novoId(), cid, 'pessoa', await cifrar(env, texto, ctx(cid)), agora),
      env.DB.prepare('UPDATE chamados SET atualizado_em = ?, nao_lidas_equipe = nao_lidas_equipe + 1 WHERE id = ?').bind(agora, cid),
    ]);
    return json({ ok: true, novo, id: cid });
  }
  return json({ erro: 'Rota não encontrada.' }, 404);
};
