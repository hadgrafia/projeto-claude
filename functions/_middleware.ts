import type { Env } from './tipos';

/**
 * Primeira barreira de tudo (site, página Entrar, app e API):
 * robôs de IA e coletores de dados conhecidos não passam, em nenhuma página.
 * (Quem tenta se passar por navegador ainda esbarra no login, nos limites de tentativas
 *  e na verificação em duas etapas.)
 */
const ROBOS = new RegExp(
  [
    'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-Web', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai',
    'CCBot', 'Google-Extended', 'GoogleOther', 'Google-CloudVertexBot', 'PerplexityBot', 'Perplexity-User', 'Bytespider', 'Amazonbot',
    'Applebot-Extended', 'FacebookBot', 'meta-externalagent', 'meta-externalfetcher', 'Diffbot', 'cohere-ai', 'cohere-training-data-crawler',
    'YouBot', 'ImagesiftBot', 'Omgilibot', 'Omgili', 'Timpibot', 'PetalBot', 'AI2Bot', 'Ai2Bot-Dolma', 'DuckAssistBot', 'MistralAI-User',
    'Kangaroo Bot', 'PanguBot', 'Scrapy', 'img2dataset', 'webzio-extended', 'VelenPublicWebCrawler', 'ICC-Crawler', 'Sidetrade',
    'FriendlyCrawler', 'iaskspider', 'ISSCyberRiskCrawler', 'Brightbot', 'Quora-Bot', 'TikTokSpider', 'SemrushBot', 'AhrefsBot',
    'DataForSeoBot', 'MJ12bot', 'DotBot', 'BLEXBot', 'magpie-crawler', 'SeekportBot', 'Crawl4AI', 'Firecrawl', 'Jina', 'Spider/',
  ]
    .map((s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
    .join('|'),
  'i',
);

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const ua = ctx.request.headers.get('User-Agent') ?? '';
  const caminho = new URL(ctx.request.url).pathname;
  if (caminho !== '/robots.txt' && ROBOS.test(ua))
    return new Response('Acesso não permitido para robôs.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, noai, noimageai' } });
  const r = await ctx.next();
  // Nenhuma página do app ou da conta aparece em buscadores nem pode ser usada para treinar IA.
  if (caminho.startsWith('/entrar') || caminho.startsWith('/app') || caminho.startsWith('/api')) {
    const resp = new Response(r.body, r);
    resp.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noai, noimageai');
    return resp;
  }
  return r;
};
