import { lerSessao } from '../auth';
import type { Env } from '../tipos';

/**
 * O app (/app) só é entregue a quem entrou com a conta de convidado.
 * Sem sessão, a pessoa vai para a página "Entrar" (e volta para onde estava depois).
 * Ícones e o manifesto ficam livres: o navegador os busca sem cookie e não têm dados.
 */
const LIVRES = /^\/app\/(manifest\.webmanifest|[\w.-]+\.(png|svg|ico))$/;

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  if (ctx.env.EXIGIR_ACCESS !== '1' || LIVRES.test(url.pathname)) return ctx.next();
  const s = await lerSessao(ctx.env, ctx.request);
  if (!s.email) {
    const pagina = (ctx.request.headers.get('Accept') ?? '').includes('text/html') || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
    if (!pagina) return new Response('Entre com sua conta.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const destino = new URL('/entrar/', url);
    destino.searchParams.set('volta', url.pathname);
    return new Response(null, { status: 302, headers: { Location: destino.pathname + destino.search, 'Cache-Control': 'no-store' } });
  }
  const r = await ctx.next();
  const resp = new Response(r.body, r);
  resp.headers.set('Cache-Control', 'private, no-cache');
  resp.headers.set('X-Frame-Options', 'DENY');
  if (s.renovar) resp.headers.append('Set-Cookie', s.renovar);
  return resp;
};
