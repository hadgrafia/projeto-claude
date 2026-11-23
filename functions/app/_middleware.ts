import { exigeLogin, lerSessao } from '../auth';
import type { Env } from '../tipos';

/**
 * O app (/app) só é entregue a quem entrou com a conta de convidado.
 * Sem sessão, a pessoa vai para a página "Entrar" (e volta para onde estava depois).
 * Ícones e o manifesto ficam livres: o navegador os busca sem cookie e não têm dados.
 */
const LIVRES = /^\/app\/(manifest\.webmanifest|compartilhar-sw\.js|[\w.-]+\.(png|svg|ico))$/;

/**
 * Política de segurança do app: só roda código do próprio app (nenhum script de terceiros,
 * anúncio ou rastreador) e só conversa com o próprio servidor, o Banco Central (Selic) e a
 * Tabela FIPE. Não pode ser aberto dentro de outro site.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' https://api.bcb.gov.br https://parallelum.com.br",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  if (!exigeLogin(ctx.env) || LIVRES.test(url.pathname)) return ctx.next();
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
  resp.headers.set('Content-Security-Policy', CSP);
  resp.headers.set('X-Content-Type-Options', 'nosniff');
  resp.headers.set('Referrer-Policy', 'no-referrer');
  resp.headers.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), bluetooth=()');
  resp.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  resp.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  resp.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  resp.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noai, noimageai');
  if (s.renovar) resp.headers.append('Set-Cookie', s.renovar);
  return resp;
};
