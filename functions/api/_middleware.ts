import { emailAccess, json, type Env } from '../tipos';

/**
 * Toda rota /api passa por aqui. Em produção, só aceita quem entrou pelo Cloudflare Access
 * (e-mail convidado). Também limita o tamanho do pedido e adiciona cabeçalhos de segurança.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  // /api/saude tem o próprio código secreto (usado só pelo robô de publicação).
  const saude = new URL(ctx.request.url).pathname === '/api/saude';
  if (!saude && ctx.env.EXIGIR_ACCESS === '1' && !emailAccess(ctx.request)) return json({ erro: 'Acesso não autorizado.' }, 401);
  const tamanho = Number(ctx.request.headers.get('Content-Length') ?? 0);
  if (tamanho > 64_000) return json({ erro: 'Pedido grande demais.' }, 413);
  const r = await ctx.next();
  const resp = new Response(r.body, r);
  resp.headers.set('X-Content-Type-Options', 'nosniff');
  resp.headers.set('Referrer-Policy', 'no-referrer');
  resp.headers.set('Cache-Control', 'no-store');
  return resp;
};
