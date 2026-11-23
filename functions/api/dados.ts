import { cifrar, decifrar } from '../cripto';
import { json, quemEsta, type Env } from '../tipos';

/**
 * Cópia da conta no servidor (para os dados voltarem ao entrar em qualquer aparelho).
 *  GET /api/dados   → { email, versao, atualizadoEm, dados } ou { email, vazio: true }
 *  PUT /api/dados   { base, dados } → { versao }  (409 se outro aparelho salvou antes)
 * "dados" chega do app já compactado (texto base64). Aqui ele é cifrado com AES-256-GCM
 * (chave DADOS_CHAVE, só no servidor), preso ao e-mail da conta, e dividido em partes.
 */
const PARTE = 900_000;
const MAX = 7_000_000;

export const onRequest: PagesFunction<Env> = async ({ request, env, data }) => {
  const email = quemEsta(data);
  if (!email) return json({ erro: 'Entre com sua conta.', sessao: true }, 401);
  if (!env.DADOS_CHAVE) return json({ erro: 'A cópia da conta ainda não foi ativada no servidor.' }, 503);

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT parte, blob, versao, atualizado_em FROM dados_conta WHERE email = ? ORDER BY parte').bind(email).all<{ parte: number; blob: string; versao: number; atualizado_em: number }>();
    if (!results.length) return json({ email, vazio: true, versao: 0 });
    const cifrado = results.map((r) => r.blob).join('');
    try {
      const dados = await decifrar(env, cifrado, email);
      return json({ email, versao: results[0].versao, atualizadoEm: results[0].atualizado_em, dados });
    } catch {
      return json({ erro: 'Não foi possível abrir a cópia da conta.' }, 500);
    }
  }

  if (request.method === 'PUT') {
    const c = (await request.json().catch(() => ({}))) as { base?: number; dados?: string };
    if (typeof c.dados !== 'string' || !c.dados || c.dados.length > MAX || !/^[A-Za-z0-9+/=]+$/.test(c.dados)) return json({ erro: 'Cópia inválida.' }, 400);
    const atual = await env.DB.prepare('SELECT versao, atualizado_em FROM dados_conta WHERE email = ? AND parte = 0').bind(email).first<{ versao: number; atualizado_em: number }>();
    const versaoAtual = atual?.versao ?? 0;
    if ((c.base ?? 0) !== versaoAtual) return json({ erro: 'Outro aparelho salvou antes.', versao: versaoAtual, atualizadoEm: atual?.atualizado_em }, 409);
    const cifrado = await cifrar(env, c.dados, email);
    const nova = versaoAtual + 1;
    const agora = Date.now();
    const partes: string[] = [];
    for (let i = 0; i < cifrado.length; i += PARTE) partes.push(cifrado.slice(i, i + PARTE));
    await env.DB.batch([
      env.DB.prepare('DELETE FROM dados_conta WHERE email = ?').bind(email),
      ...partes.map((p, i) => env.DB.prepare('INSERT INTO dados_conta (email, parte, blob, versao, atualizado_em) VALUES (?, ?, ?, ?, ?)').bind(email, i, p, nova, agora)),
    ]);
    return json({ versao: nova, atualizadoEm: agora });
  }
  return json({ erro: 'Rota não encontrada.' }, 404);
};
