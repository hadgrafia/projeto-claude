import type { Env } from './tipos';

/**
 * Cifra do servidor: AES-256-GCM com a chave DADOS_CHAVE (só existe nos segredos do servidor).
 * O "contexto" (ex.: o e-mail da conta) entra como dado autenticado: um texto cifrado de uma
 * conta não abre em outra, mesmo que alguém troque as linhas do banco.
 */
export const b64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
export const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function chave(env: Env) {
  if (!env.DADOS_CHAVE) throw new Error('DADOS_CHAVE não configurada');
  return crypto.subtle.importKey('raw', deB64(env.DADOS_CHAVE), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function cifrar(env: Env, texto: string, contexto: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(contexto) }, await chave(env), new TextEncoder().encode(texto));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function decifrar(env: Env, blob: string, contexto: string) {
  const [iv, ct] = blob.split('.');
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv), additionalData: new TextEncoder().encode(contexto) }, await chave(env), deB64(ct));
  return new TextDecoder().decode(claro);
}
