export interface Env {
  DB: D1Database;
  /** "1" em produção: só aceita pedidos que passaram pelo Cloudflare Access. */
  EXIGIR_ACCESS?: string;
  /** E-mail de quem administra o app (pode convidar sem limite). */
  ADMIN_EMAIL?: string;
  /** Análise com IA pelo Google Cloud (Vertex AI): JSON da chave da conta de serviço. */
  GCP_SA_KEY?: string;
  GCP_PROJECT_ID?: string;
  GCP_REGION?: string;
  /** Código da verificação automática (definido pelo robô de publicação). */
  VERIFICACAO?: string;
  /** Convite automático no Cloudflare Access (token só com permissão de grupos do Access). */
  CF_ACCESS_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_ACCESS_GROUP_ID?: string;
}

export const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** E-mail confirmado pelo Cloudflare Access (o próprio Access injeta este cabeçalho). */
export const emailAccess = (req: Request) => req.headers.get('Cf-Access-Authenticated-User-Email')?.toLowerCase() ?? '';

export async function sha256(texto: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const idValido = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(s);
export const blobValido = (s: unknown): s is string => typeof s === 'string' && s.length > 10 && s.length <= 32_000;
