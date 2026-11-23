import { iguais } from '../../auth';
import { blobValido, idValido, json, quemEsta, sha256, type Env } from '../../tipos';

/**
 * Planos em conjunto (até 6 pessoas por plano).
 * Autenticação de cada participante: cabeçalho "X-Membro: <membroId>:<segredo>".
 * O servidor só guarda o hash do segredo e dados cifrados de ponta a ponta.
 *
 *  POST   /api/conjunto                    criar (quem cria vira participante)
 *  GET    /api/conjunto/:id                ler plano e resumos dos participantes
 *  PUT    /api/conjunto/:id/plano          atualizar a definição do plano (com versão)
 *  PUT    /api/conjunto/:id/membro         atualizar o próprio resumo
 *  DELETE /api/conjunto/:id/membro         sair do plano
 *  POST   /api/conjunto/:id/convite        gerar convite (uso único, 48 h)
 *  POST   /api/conjunto/:id/entrar         entrar com um convite
 */
const MAX_MEMBROS = 6;
const VALIDADE_CONVITE = 48 * 3600 * 1000;

async function autenticar(env: Env, req: Request, planoId: string) {
  const [membroId, segredo] = (req.headers.get('X-Membro') ?? '').split(':');
  if (!idValido(membroId) || !idValido(segredo)) return null;
  const m = await env.DB.prepare('SELECT membro_id, hash FROM membros WHERE plano_id = ? AND membro_id = ?').bind(planoId, membroId).first<{ membro_id: string; hash: string }>();
  if (!m || !iguais(m.hash, await sha256(segredo))) return null;
  return membroId;
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params, data }) => {
  const partes = (params.rota as string[] | undefined) ?? [];
  const [planoId, acao] = partes;
  const metodo = request.method;
  const agora = Date.now();
  const corpo = metodo === 'GET' || metodo === 'DELETE' ? {} : ((await request.json().catch(() => ({}))) as Record<string, unknown>);
  const email = quemEsta(data) || null;

  // Criar
  if (!planoId && metodo === 'POST') {
    const { id, membroId, segredoHash, blobPlano, blobMembro } = corpo;
    if (!idValido(id) || !idValido(membroId) || typeof segredoHash !== 'string' || !/^[a-f0-9]{64}$/.test(segredoHash) || !blobValido(blobPlano) || !blobValido(blobMembro))
      return json({ erro: 'Dados inválidos.' }, 400);
    const r = await env.DB.batch([
      env.DB.prepare('INSERT INTO planos (id, blob, versao, criado_em) VALUES (?, ?, 1, ?)').bind(id, blobPlano, agora),
      env.DB.prepare('INSERT INTO membros (plano_id, membro_id, hash, blob, email, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)').bind(id, membroId, segredoHash, blobMembro, email, agora),
    ]).catch(() => null);
    return r ? json({ ok: true }, 201) : json({ erro: 'Não foi possível criar.' }, 409);
  }
  if (!idValido(planoId)) return json({ erro: 'Plano inválido.' }, 400);

  // Entrar com convite (ainda não é participante)
  if (acao === 'entrar' && metodo === 'POST') {
    const { convite, membroId, segredoHash, blobMembro } = corpo;
    if (!idValido(convite) || !idValido(membroId) || typeof segredoHash !== 'string' || !/^[a-f0-9]{64}$/.test(segredoHash) || !blobValido(blobMembro))
      return json({ erro: 'Dados inválidos.' }, 400);
    const hashConvite = await sha256(convite);
    const c = await env.DB.prepare('SELECT plano_id, expira FROM convites WHERE hash = ?').bind(hashConvite).first<{ plano_id: string; expira: number }>();
    if (!c || c.plano_id !== planoId || c.expira < agora) return json({ erro: 'Convite inválido ou vencido. Peça um novo.' }, 403);
    const qtd = await env.DB.prepare('SELECT COUNT(*) AS n FROM membros WHERE plano_id = ?').bind(planoId).first<{ n: number }>();
    if ((qtd?.n ?? 0) >= MAX_MEMBROS) return json({ erro: `O plano já tem ${MAX_MEMBROS} participantes.` }, 409);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM convites WHERE hash = ?').bind(hashConvite), // uso único
      env.DB.prepare('INSERT INTO membros (plano_id, membro_id, hash, blob, email, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)').bind(planoId, membroId, segredoHash, blobMembro, email, agora),
    ]);
    return json({ ok: true }, 201);
  }

  const eu = await autenticar(env, request, planoId);
  if (!eu) return json({ erro: 'Você não participa deste plano.' }, 403);

  if (!acao && metodo === 'GET') {
    const plano = await env.DB.prepare('SELECT blob, versao FROM planos WHERE id = ?').bind(planoId).first<{ blob: string; versao: number }>();
    if (!plano) return json({ erro: 'Plano não encontrado.' }, 404);
    const { results } = await env.DB.prepare('SELECT membro_id, blob, atualizado_em FROM membros WHERE plano_id = ? ORDER BY atualizado_em').bind(planoId).all<{ membro_id: string; blob: string; atualizado_em: number }>();
    return json({ blobPlano: plano.blob, versao: plano.versao, membros: results.map((m) => ({ membroId: m.membro_id, blob: m.blob, atualizadoEm: m.atualizado_em })) });
  }
  if (acao === 'plano' && metodo === 'PUT') {
    const { blob, versao } = corpo;
    if (!blobValido(blob) || typeof versao !== 'number') return json({ erro: 'Dados inválidos.' }, 400);
    const r = await env.DB.prepare('UPDATE planos SET blob = ?, versao = versao + 1 WHERE id = ? AND versao = ?').bind(blob, planoId, versao).run();
    return r.meta.changes ? json({ ok: true, versao: versao + 1 }) : json({ erro: 'Outra pessoa alterou o plano. Atualize e tente de novo.' }, 409);
  }
  if (acao === 'membro' && metodo === 'PUT') {
    if (!blobValido(corpo.blob)) return json({ erro: 'Dados inválidos.' }, 400);
    await env.DB.prepare('UPDATE membros SET blob = ?, atualizado_em = ? WHERE plano_id = ? AND membro_id = ?').bind(corpo.blob, agora, planoId, eu).run();
    return json({ ok: true });
  }
  if (acao === 'membro' && metodo === 'DELETE') {
    await env.DB.prepare('DELETE FROM membros WHERE plano_id = ? AND membro_id = ?').bind(planoId, eu).run();
    const resta = await env.DB.prepare('SELECT COUNT(*) AS n FROM membros WHERE plano_id = ?').bind(planoId).first<{ n: number }>();
    if (!resta?.n) await env.DB.batch([env.DB.prepare('DELETE FROM planos WHERE id = ?').bind(planoId), env.DB.prepare('DELETE FROM convites WHERE plano_id = ?').bind(planoId)]);
    return json({ ok: true });
  }
  if (acao === 'convite' && metodo === 'POST') {
    const { conviteHash } = corpo;
    if (typeof conviteHash !== 'string' || !/^[a-f0-9]{64}$/.test(conviteHash)) return json({ erro: 'Dados inválidos.' }, 400);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM convites WHERE expira < ?').bind(agora),
      env.DB.prepare('INSERT INTO convites (hash, plano_id, criado_por, expira) VALUES (?, ?, ?, ?)').bind(conviteHash, planoId, eu, agora + VALIDADE_CONVITE),
    ]);
    return json({ ok: true, expira: agora + VALIDADE_CONVITE }, 201);
  }
  return json({ erro: 'Rota não encontrada.' }, 404);
};
