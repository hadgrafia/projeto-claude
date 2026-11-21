export interface Env {
  DB: D1Database;
  /** "1" em produção: o app e a API só abrem com a conta (e-mail + senha) de um convidado. */
  EXIGIR_ACCESS?: string;
  /** E-mail de quem administra o app (pode convidar sem limite). */
  ADMIN_EMAIL?: string;
  /** Análise com IA pelo Google Cloud (Vertex AI): JSON da chave da conta de serviço. */
  GCP_SA_KEY?: string;
  GCP_PROJECT_ID?: string;
  GCP_REGION?: string;
  /** Opcional: modelo do Claude preferido no Vertex AI (os outros ficam de reserva). */
  GCP_MODELO?: string;
  /** Chave (base64, 32 bytes) que cifra a cópia da conta no servidor. Criada uma vez pelo robô. */
  DADOS_CHAVE?: string;
  /** Código da verificação automática (definido pelo robô de publicação). */
  VERIFICACAO?: string;
  /** Convite automático no Cloudflare Access (token só com permissão de grupos do Access). */
  CF_ACCESS_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_ACCESS_GROUP_ID?: string;
}

export const json = (corpo: unknown, status = 200, cookie?: string) => {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  if (cookie) headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify(corpo), { status, headers });
};

/** Dados que o middleware entrega às rotas: o e-mail da conta que está usando o app. */
export interface Dados {
  email?: string;
  [k: string]: unknown;
}
/** E-mail da conta logada (definido pelo middleware a partir do cookie de sessão). */
export const quemEsta = (data: unknown) => String((data as Dados | undefined)?.email ?? '');

export async function sha256(texto: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const idValido = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(s);
export const blobValido = (s: unknown): s is string => typeof s === 'string' && s.length > 10 && s.length <= 32_000;
