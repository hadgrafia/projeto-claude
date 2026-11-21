import { lerSessao } from '../auth';
import { json, type Env } from '../tipos';

/**
 * Toda rota /api passa por aqui. Em produção, só aceita quem entrou com a conta de convidado
 * (cookie de sessão). Também bloqueia pedidos vindos de outros sites, limita o tamanho
 * e adiciona cabeçalhos de segurança.
 */
const PUBLICAS = ['/api/saude', '/api/pedido-convite'];

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const caminho = url.pathname;
  const metodo = ctx.request.method;
  // Pedidos que mudam algo só podem vir do próprio site (contra ataques de outros sites).
  const origem = ctx.request.headers.get('Origin');
  if (metodo !== 'GET' && metodo !== 'HEAD' && origem && origem !== url.origin) return json({ erro: 'Origem não permitida.' }, 403);
  const tamanho = Number(ctx.request.headers.get('Content-Length') ?? 0);
  // Os agentes recebem áudio, foto ou PDF (até ~5 MB); o resto da API, só textos pequenos.
  if (tamanho > (caminho === '/api/agente' ? 8_000_000 : 64_000)) return json({ erro: 'Arquivo grande demais.' }, 413);

  let renovar: string | undefined;
  const publica = PUBLICAS.includes(caminho) || caminho.startsWith('/api/conta/');
  if (!publica && ctx.env.EXIGIR_ACCESS === '1') {
    const s = await lerSessao(ctx.env, ctx.request);
    if (!s.email) return json({ erro: 'Sua sessão expirou. Entre de novo com seu e-mail e senha.', sessao: true }, 401);
    ctx.data.email = s.email;
    renovar = s.renovar;
  }
  const r = await ctx.next();
  const resp = new Response(r.body, r);
  resp.headers.set('X-Content-Type-Options', 'nosniff');
  resp.headers.set('Referrer-Policy', 'no-referrer');
  resp.headers.set('Cache-Control', 'no-store');
  resp.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  resp.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (renovar) resp.headers.append('Set-Cookie', renovar);
  return resp;
};
