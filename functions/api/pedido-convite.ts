import { hashSenha, problemaNaSenha } from '../auth';
import { json, sha256, type Env } from '../tipos';

/**
 * Pedido de convite feito pela página pública. Proteções contra abuso:
 * campo "armadilha" invisível, limite de 3 pedidos por dia por conexão (guardada só como hash)
 * e no máximo 300 pedidos pendentes.
 */
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const c = (await request.json().catch(() => ({}))) as { nome?: string; email?: string; mensagem?: string; site?: string; aceite?: boolean; senha?: string };
  if (c.site) return json({ ok: true }); // robôs preenchem o campo invisível
  const nome = String(c.nome ?? '').trim().slice(0, 80);
  const email = String(c.email ?? '').trim().toLowerCase().slice(0, 254);
  const mensagem = String(c.mensagem ?? '').trim().slice(0, 500);
  if (nome.length < 2) return json({ erro: 'Informe seu nome.' }, 400);
  if (!EMAIL.test(email)) return json({ erro: 'Informe um e-mail válido.' }, 400);
  if (!c.aceite) return json({ erro: 'É preciso concordar com a política de privacidade.' }, 400);
  // Senha criada junto com o pedido (opcional para pedidos antigos): quando aprovado, já entra com ela.
  const senha = typeof c.senha === 'string' ? c.senha.slice(0, 200) : '';
  if (senha) {
    const problema = problemaNaSenha(senha, email);
    if (problema) return json({ erro: problema }, 400);
  }
  const conta = await env.DB.prepare('SELECT 1 FROM contas WHERE email = ?').bind(email).first();
  // Já tem conta: responde igual a um pedido novo (não revela quem tem conta).
  if (conta) return json({ ok: true, comSenha: Boolean(senha) }, 201);

  const agora = Date.now();
  const ipHash = await sha256(`${request.headers.get('CF-Connecting-IP') ?? ''}|meus-planos`);
  const recentes = await env.DB.prepare('SELECT COUNT(*) AS n FROM pedidos WHERE ip_hash = ? AND criado_em > ?').bind(ipHash, agora - 86_400_000).first<{ n: number }>();
  if ((recentes?.n ?? 0) >= 3) return json({ erro: 'Muitos pedidos hoje. Tente de novo amanhã.' }, 429);
  const pendentes = await env.DB.prepare("SELECT COUNT(*) AS n FROM pedidos WHERE status = 'pendente'").first<{ n: number }>();
  if ((pendentes?.n ?? 0) >= 300) return json({ erro: 'A lista de pedidos está cheia no momento. Tente mais tarde.' }, 503);
  const ja = await env.DB.prepare("SELECT id FROM pedidos WHERE email = ? AND status = 'pendente'").bind(email).first<{ id: string }>();
  if (ja) {
    // Pediu de novo: vale a senha mais nova.
    if (senha) await env.DB.prepare('INSERT OR REPLACE INTO pedidos_senha (pedido_id, senha) VALUES (?, ?)').bind(ja.id, await hashSenha(senha)).run();
    return json({ ok: true, jaPedido: true });
  }

  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO pedidos (id, nome, email, mensagem, status, ip_hash, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, nome, email, mensagem || null, 'pendente', ipHash, agora),
    ...(senha ? [env.DB.prepare('INSERT INTO pedidos_senha (pedido_id, senha) VALUES (?, ?)').bind(id, await hashSenha(senha))] : []),
  ]);
  return json({ ok: true, comSenha: Boolean(senha) }, 201);
};
