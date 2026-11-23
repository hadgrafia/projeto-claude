import { sha256, type Env } from './tipos';

/**
 * Conta do app: e-mail + senha (só para e-mails convidados).
 * - A senha nunca é guardada: só o hash PBKDF2-SHA256 com sal aleatório.
 * - O e-mail é confirmado uma única vez pelo Cloudflare Access (código no e-mail),
 *   que também só aceita e-mails da lista de convidados.
 * - A sessão é um cookie HttpOnly e Secure com um código aleatório; o servidor guarda só o hash dele.
 */

export const COOKIE = '__Host-mp_sessao';
export const DURACAO_SESSAO = 30 * 24 * 3600 * 1000; // 30 dias sem usar: sai sozinho
/** Mesmo usando sempre, a sessão vence em 180 dias e a pessoa entra de novo com a senha. */
export const VIDA_MAXIMA_SESSAO = 180 * 24 * 3600 * 1000;

/** Login exigido em tudo, a não ser que o servidor diga explicitamente o contrário (só no teste local). */
export const exigeLogin = (env: Env) => env.EXIGIR_ACCESS !== '0';

/** "Android · Chrome", "iPhone · Safari", "App Android"… (só o tipo, nada que identifique a pessoa). */
export function descreverAparelho(ua: string) {
  const sistema = /Android/i.test(ua) ? 'Android' : /iPhone/i.test(ua) ? 'iPhone' : /iPad/i.test(ua) ? 'iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Aparelho';
  if (/; wv\)/.test(ua) && sistema === 'Android') return 'App Android';
  const nav = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'Navegador';
  return `${sistema} · ${nav}`;
}
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

export async function criarSessao(env: Env, email: string, req?: Request) {
  const token = aleatorio();
  const agora = Date.now();
  const hash = await sha256(token);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessoes WHERE expira < ? OR criada_em < ?').bind(agora, agora - VIDA_MAXIMA_SESSAO),
    env.DB.prepare('DELETE FROM sessoes_info WHERE hash NOT IN (SELECT hash FROM sessoes)'),
    env.DB.prepare('INSERT INTO sessoes (hash, email, expira, criada_em) VALUES (?, ?, ?, ?)').bind(hash, email, agora + DURACAO_SESSAO, agora),
    env.DB.prepare('INSERT OR REPLACE INTO sessoes_info (hash, aparelho, pais, ultimo_uso) VALUES (?, ?, ?, ?)').bind(
      hash,
      descreverAparelho(req?.headers.get('User-Agent') ?? ''),
      (req?.headers.get('CF-IPCountry') ?? '').slice(0, 2) || null,
      agora,
    ),
  ]);
  return cookieSessao(token, DURACAO_SESSAO);
}

/** E-mail da sessão (ou vazio). Renova a sessão quando faltam menos de 15 dias. */
export async function lerSessao(env: Env, req: Request): Promise<{ email: string; renovar?: string; hash?: string }> {
  const token = lerCookie(req);
  if (!token) return { email: '' };
  const hash = await sha256(token);
  const s = await env.DB.prepare(
    'SELECT s.email, s.expira, s.criada_em, i.ultimo_uso FROM sessoes s JOIN contas c ON c.email = s.email LEFT JOIN sessoes_info i ON i.hash = s.hash WHERE s.hash = ?',
  )
    .bind(hash)
    .first<{ email: string; expira: number; criada_em: number; ultimo_uso: number | null }>();
  const agora = Date.now();
  if (!s || s.expira < agora || s.criada_em < agora - VIDA_MAXIMA_SESSAO) return { email: '' };
  // Último uso (para a lista de aparelhos conectados): no máximo uma escrita por hora.
  if (!s.ultimo_uso || agora - s.ultimo_uso > 3600_000)
    await env.DB.prepare('INSERT INTO sessoes_info (hash, aparelho, ultimo_uso) VALUES (?, ?, ?) ON CONFLICT(hash) DO UPDATE SET ultimo_uso = excluded.ultimo_uso')
      .bind(hash, descreverAparelho(req.headers.get('User-Agent') ?? ''), agora)
      .run()
      .catch(() => undefined);
  if (s.expira - agora < DURACAO_SESSAO / 2) {
    const novo = Math.min(agora + DURACAO_SESSAO, s.criada_em + VIDA_MAXIMA_SESSAO);
    await env.DB.prepare('UPDATE sessoes SET expira = ? WHERE hash = ?').bind(novo, hash).run();
    return { email: s.email, renovar: cookieSessao(token, novo - agora), hash };
  }
  return { email: s.email, hash };
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

/* ---------- Convites pessoais (criar conta) e links para criar senha nova ---------- */

export type TipoConvite = 'conta' | 'senha';
const DIA = 24 * 3600 * 1000;

/**
 * Cria um link de uso único, preso a um e-mail. Quem recebe o link no próprio e-mail comprova
 * que o e-mail é dele: não é preciso código nem tela de terceiros. O servidor guarda só o hash.
 * Convite para criar conta vale 14 dias; link de senha nova vale 24 horas.
 */
export async function criarConvite(env: Env, email: string, tipo: TipoConvite, criadoPor: string, origem: string) {
  const token = aleatorio();
  const agora = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM convites_conta WHERE expira < ? OR (email = ? AND tipo = ?)').bind(agora, email, tipo),
    env.DB.prepare('INSERT INTO convites_conta (hash, email, tipo, criado_por, criado_em, expira) VALUES (?, ?, ?, ?, ?, ?)').bind(
      await sha256(token),
      email,
      tipo,
      criadoPor,
      agora,
      agora + (tipo === 'conta' ? 14 : 1) * DIA,
    ),
  ]);
  return `${origem}/entrar/?${tipo === 'conta' ? 'convite' : 'senha'}=${token}`;
}

export async function lerConvite(env: Env, token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const c = await env.DB.prepare('SELECT email, tipo, expira FROM convites_conta WHERE hash = ?').bind(await sha256(token)).first<{ email: string; tipo: TipoConvite; expira: number }>();
  return c && c.expira > Date.now() ? c : null;
}
