import { Capacitor, registerPlugin } from '@capacitor/core';
import { lerCache, salvarCache } from '../db';

/**
 * Bloqueio do app: senha (PIN) + digital / reconhecimento facial.
 * - O PIN nunca é guardado: só um hash PBKDF2-SHA256 com sal aleatório (310 mil iterações).
 * - Erros seguidos travam o app por um tempo que dobra a cada nova série de erros.
 * - Biometria: no Android usa o BiometricPrompt do sistema (digital e rosto);
 *   no iPhone e no navegador usa o Face ID / Touch ID / Windows Hello via WebAuthn.
 * - O PIN continua sendo a chave principal: a biometria só é um atalho para desbloquear.
 */

export interface ConfigBloqueio {
  ativo: boolean;
  sal: string;
  hash: string;
  iteracoes: number;
  biometria?: { tipo: 'android' } | { tipo: 'webauthn'; credId: string };
  /** Segundos fora do app até bloquear de novo. 0 = sempre que sair. */
  bloquearApos: number;
  erros: number;
  travadoAte?: number;
  rodadasDeErro: number;
}

const ITERACOES = 310_000;
const CHAVE = 'bloqueio';

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derivar(pin: string, sal: Uint8Array, iteracoes: number): Promise<ArrayBuffer> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, base, 256);
}

function iguais(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export async function lerBloqueio(): Promise<ConfigBloqueio | undefined> {
  return (await lerCache<ConfigBloqueio>(CHAVE))?.valor;
}

const salvar = (c: ConfigBloqueio) => salvarCache(CHAVE, c);

export const pinValido = (pin: string) => /^\d{6}$/.test(pin) && !/^(\d)\1{5}$/.test(pin) && !['123456', '654321', '012345', '123123'].includes(pin);

export async function definirPin(pin: string, atual?: ConfigBloqueio) {
  if (!pinValido(pin)) throw new Error('Use 6 números, sem sequências óbvias como 123456 ou 111111.');
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(pin, sal, ITERACOES);
  await salvar({
    ativo: true,
    sal: b64(sal),
    hash: b64(hash),
    iteracoes: ITERACOES,
    biometria: atual?.biometria,
    bloquearApos: atual?.bloquearApos ?? 30,
    erros: 0,
    rodadasDeErro: 0,
  });
}

export type ResultadoPin = { ok: true } | { ok: false; travadoAte?: number; restantes?: number };

export async function conferirPin(pin: string): Promise<ResultadoPin> {
  const c = await lerBloqueio();
  if (!c?.ativo) return { ok: true };
  if (c.travadoAte && Date.now() < c.travadoAte) return { ok: false, travadoAte: c.travadoAte };
  const hash = new Uint8Array(await derivar(pin, deB64(c.sal), c.iteracoes));
  if (iguais(hash, deB64(c.hash))) {
    await salvar({ ...c, erros: 0, rodadasDeErro: 0, travadoAte: undefined });
    return { ok: true };
  }
  const erros = c.erros + 1;
  if (erros >= 5) {
    const rodadas = c.rodadasDeErro + 1;
    const travadoAte = Date.now() + 30_000 * 2 ** (rodadas - 1); // 30 s, 1 min, 2 min, 4 min…
    await salvar({ ...c, erros: 0, rodadasDeErro: rodadas, travadoAte });
    return { ok: false, travadoAte };
  }
  await salvar({ ...c, erros });
  return { ok: false, restantes: 5 - erros };
}

export async function desativarBloqueio(pin: string) {
  const r = await conferirPin(pin);
  if (!r.ok) return r;
  const c = await lerBloqueio();
  if (c) await salvar({ ...c, ativo: false, biometria: undefined });
  return r;
}

export async function definirTempo(segundos: number) {
  const c = await lerBloqueio();
  if (c) await salvar({ ...c, bloquearApos: segundos });
}

/* ---------------- Biometria ---------------- */

interface BiometriaNativa {
  disponivel(): Promise<{ disponivel: boolean; motivo?: string }>;
  autenticar(o: { titulo: string; subtitulo: string }): Promise<{ ok: boolean }>;
}
const Nativa = registerPlugin<BiometriaNativa>('Biometria');
const ehAndroid = () => Capacitor.getPlatform() === 'android';

export async function biometriaDisponivel(): Promise<boolean> {
  try {
    if (ehAndroid()) return (await Nativa.disponivel()).disponivel;
    return Boolean(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()));
  } catch {
    return false;
  }
}

export async function ativarBiometria(): Promise<void> {
  const c = await lerBloqueio();
  if (!c?.ativo) throw new Error('Crie a senha do app primeiro.');
  if (ehAndroid()) {
    const r = await Nativa.autenticar({ titulo: 'Ativar desbloqueio', subtitulo: 'Use a digital ou o rosto' });
    if (!r.ok) throw new Error('Não foi possível confirmar a biometria.');
    await salvar({ ...c, biometria: { tipo: 'android' } });
    return;
  }
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Meus Planos Financeiros', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'meus-planos', displayName: 'Meus Planos' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Biometria cancelada.');
  await salvar({ ...c, biometria: { tipo: 'webauthn', credId: b64(cred.rawId) } });
}

export async function desbloquearComBiometria(): Promise<boolean> {
  const c = await lerBloqueio();
  if (!c?.biometria || (c.travadoAte && Date.now() < c.travadoAte)) return false;
  try {
    if (c.biometria.tipo === 'android') {
      return (await Nativa.autenticar({ titulo: 'Meus Planos', subtitulo: 'Desbloqueie com a digital ou o rosto' })).ok;
    }
    const r = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: deB64(c.biometria.credId) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return Boolean(r);
  } catch {
    return false;
  }
}

export async function removerBiometria() {
  const c = await lerBloqueio();
  if (c) await salvar({ ...c, biometria: undefined });
}

/* ---------------- Cópia de segurança cifrada ---------------- */

/** Cifra a cópia de segurança com uma senha (AES-GCM, chave derivada por PBKDF2). */
export async function cifrar(texto: string, senha: string) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bits = await derivar(senha, sal, ITERACOES);
  const chave = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt']);
  const dados = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, new TextEncoder().encode(texto));
  return JSON.stringify({ formato: 'meus-planos-cifrado-1', sal: b64(sal), iv: b64(iv), dados: b64(dados) });
}

export async function decifrar(conteudo: string, senha: string) {
  const o = JSON.parse(conteudo) as { formato: string; sal: string; iv: string; dados: string };
  if (o.formato !== 'meus-planos-cifrado-1') return conteudo; // cópia antiga, sem cifra
  const bits = await derivar(senha, deB64(o.sal), ITERACOES);
  const chave = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['decrypt']);
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(o.iv) }, chave, deB64(o.dados));
  return new TextDecoder().decode(claro);
}
