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

const b64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function chave(env: Env) {
  if (!env.DADOS_CHAVE) throw new Error('DADOS_CHAVE não configurada');
  return crypto.subtle.importKey('raw', deB64(env.DADOS_CHAVE), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function cifrar(env: Env, texto: string, email: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(email) }, await chave(env), new TextEncoder().encode(texto));
  return `${b64(iv)}.${b64(ct)}`;
}
async function decifrar(env: Env, blob: string, email: string) {
  const [iv, ct] = blob.split('.');
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv), additionalData: new TextEncoder().encode(email) }, await chave(env), deB64(ct));
  return new TextDecoder().decode(claro);
}

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
