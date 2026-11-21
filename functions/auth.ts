import { sha256, type Env } from './tipos';

/**
 * Conta do app: e-mail + senha (só para e-mails convidados).
 * - A senha nunca é guardada: só o hash PBKDF2-SHA256 com sal aleatório.
 * - O e-mail é confirmado uma única vez pelo Cloudflare Access (código no e-mail),
 *   que também só aceita e-mails da lista de convidados.
 * - A sessão é um cookie HttpOnly e Secure com um código aleatório; o servidor guarda só o hash dele.
 */

export const COOKIE = '__Host-mp_sessao';
export const DURACAO_SESSAO = 30 * 24 * 3600 * 1000; // 30 dias
const ITERACOES = 100_000; // máximo permitido pela Cloudflare
export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const deHex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (x) => parseInt(x, 16));
export const aleatorio = (n = 32) => {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function pbkdf2(senha: string, sal: Uint8Array, iter: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iter }, base, 256);
}

export async function hashSenha(senha: string) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERACOES}$${hex(sal)}$${hex(await pbkdf2(senha, sal, ITERACOES))}`;
}

/** Comparação em tempo constante (não revela onde os textos diferem). */
export function iguais(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  const sutil = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (a: ArrayBufferView, b: ArrayBufferView) => boolean };
  if (sutil.timingSafeEqual) return sutil.timingSafeEqual(x, y);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export async function conferirSenha(senha: string, guardado: string) {
  const [alg, iter, sal, hash] = guardado.split('$');
  if (alg !== 'pbkdf2' || !sal || !hash) return false;
  return iguais(hex(await pbkdf2(senha, deHex(sal), Number(iter))), hash);
}

/** Senha forte o bastante: 8+ caracteres, letras e números, sem ser óbvia. */
export function problemaNaSenha(senha: string, email: string) {
  if (senha.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (senha.length > 128) return 'A senha pode ter no máximo 128 caracteres.';
  if (!/[a-zA-ZÀ-ú]/.test(senha) || !/\d/.test(senha)) return 'Use letras e números na senha.';
  if (/^(.)\1+$/.test(senha) || /^(12345678|123456789|password|senha123|abc12345)/i.test(senha)) return 'Essa senha é fácil demais de adivinhar.';
  if (senha.toLowerCase().includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length >= 4) return 'Não use o seu e-mail dentro da senha.';
  return '';
}

export const cookieSessao = (token: string, maxAge: number) => `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}`;
export const lerCookie = (req: Request) => req.headers.get('Cookie')?.match(new RegExp(`(?:^|;\\s*)${COOKIE.replace(/[-]/g, '\\-')}=([A-Za-z0-9_-]{20,})`))?.[1];

export async function criarSessao(env: Env, email: string) {
  const token = aleatorio();
  const agora = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessoes WHERE expira < ?').bind(agora),
    env.DB.prepare('INSERT INTO sessoes (hash, email, expira, criada_em) VALUES (?, ?, ?, ?)').bind(await sha256(token), email, agora + DURACAO_SESSAO, agora),
  ]);
  return cookieSessao(token, DURACAO_SESSAO);
}

/** E-mail da sessão (ou vazio). Renova a sessão quando faltam menos de 15 dias. */
export async function lerSessao(env: Env, req: Request): Promise<{ email: string; renovar?: string }> {
  const token = lerCookie(req);
  if (!token) return { email: '' };
  const hash = await sha256(token);
  const s = await env.DB.prepare('SELECT s.email, s.expira FROM sessoes s JOIN contas c ON c.email = s.email WHERE s.hash = ?').bind(hash).first<{ email: string; expira: number }>();
  if (!s || s.expira < Date.now()) return { email: '' };
  if (s.expira - Date.now() < DURACAO_SESSAO / 2) {
    await env.DB.prepare('UPDATE sessoes SET expira = ? WHERE hash = ?').bind(Date.now() + DURACAO_SESSAO, hash).run();
    return { email: s.email, renovar: cookieSessao(token, DURACAO_SESSAO) };
  }
  return { email: s.email };
}

/**
 * Limite de tentativas (contra quem tenta adivinhar senhas). Conta por chave
 * (ex.: "ip:…" ou "email:…") dentro de uma janela de tempo.
 */
export async function excedeu(env: Env, chave: string, limite: number, janelaMs: number, somar = true) {
  const agora = Date.now();
  const t = await env.DB.prepare('SELECT n, desde FROM tentativas WHERE chave = ?').bind(chave).first<{ n: number; desde: number }>();
  const dentro = t && agora - t.desde < janelaMs;
  const n = dentro ? t.n : 0;
  if (n >= limite) return true;
  if (somar) {
    await env.DB.prepare('INSERT INTO tentativas (chave, n, desde) VALUES (?, 1, ?) ON CONFLICT(chave) DO UPDATE SET n = ?, desde = ?')
      .bind(chave, agora, n + 1, dentro ? t.desde : agora)
      .run();
  }
  return false;
}
export const zerarTentativas = (env: Env, chave: string) => env.DB.prepare('DELETE FROM tentativas WHERE chave = ?').bind(chave).run();
export const chaveIp = async (req: Request) => `ip:${(await sha256(`${req.headers.get('CF-Connecting-IP') ?? '?'}-meus-planos`)).slice(0, 32)}`;

/* ---------- Confirmação do e-mail pelo Cloudflare Access (JWT assinado) ---------- */

type Jwk = JsonWebKey & { kid: string };
let certs: { chaves: Jwk[]; em: number } | undefined;

const deB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

/**
 * Confere o token que o Cloudflare Access entrega depois do código no e-mail:
 * assinatura RS256 com as chaves públicas da equipe, emissor, público (AUD) e validade.
 * Devolve o e-mail confirmado ou vazio.
 */
export async function emailConfirmadoPeloAccess(env: Env, req: Request): Promise<string> {
  const jwt = req.headers.get('Cf-Access-Jwt-Assertion') ?? req.headers.get('Cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  if (!jwt || !env.ACCESS_EQUIPE || !env.ACCESS_AUD) return '';
  const [c, p, a] = jwt.split('.');
  if (!c || !p || !a) return '';
  try {
    const cab = JSON.parse(new TextDecoder().decode(deB64url(c))) as { alg: string; kid: string };
    const dados = JSON.parse(new TextDecoder().decode(deB64url(p))) as { aud: string | string[]; exp: number; iss: string; email?: string };
    if (cab.alg !== 'RS256') return '';
    if (!certs || Date.now() - certs.em > 3600_000 || !certs.chaves.some((k) => k.kid === cab.kid)) {
      const r = (await (await fetch(`https://${env.ACCESS_EQUIPE}/cdn-cgi/access/certs`)).json()) as { keys: Jwk[] };
      certs = { chaves: r.keys, em: Date.now() };
    }
    const jwk = certs.chaves.find((k) => k.kid === cab.kid);
    if (!jwk) return '';
    const chave = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', chave, deB64url(a), new TextEncoder().encode(`${c}.${p}`));
    const auds = Array.isArray(dados.aud) ? dados.aud : [dados.aud];
    if (!ok || !auds.includes(env.ACCESS_AUD) || dados.iss !== `https://${env.ACCESS_EQUIPE}` || dados.exp * 1000 < Date.now()) return '';
    return (dados.email ?? '').toLowerCase();
  } catch {
    return '';
  }
}
