/**
 * Verificação em duas etapas com app autenticador (Google Authenticator, Microsoft Authenticator,
 * Authy, 2FAS…), padrão TOTP (RFC 6238): código de 6 dígitos que muda a cada 30 segundos.
 * Funciona sem internet no celular e sem custo (não usa SMS nem e-mail).
 */

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const PASSO_SEGUNDOS = 30;

export function base32(bytes: Uint8Array) {
  let bits = 0;
  let valor = 0;
  let out = '';
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALFABETO[(valor << (5 - bits)) & 31];
  return out;
}

export function deBase32(texto: string) {
  const limpo = texto.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let valor = 0;
  const out: number[] = [];
  for (const c of limpo) {
    valor = (valor << 5) | ALFABETO.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Segredo novo (160 bits, como pede o padrão). */
export const novoSegredo = () => base32(crypto.getRandomValues(new Uint8Array(20)));

export const passoAtual = (agoraMs = Date.now()) => Math.floor(agoraMs / 1000 / PASSO_SEGUNDOS);

/** Código de 6 dígitos de um passo de tempo. */
export async function codigoDoPasso(segredo: string, passo: number) {
  const chave = await crypto.subtle.importKey('raw', deBase32(segredo), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const contador = new ArrayBuffer(8);
  const v = new DataView(contador);
  v.setUint32(0, Math.floor(passo / 2 ** 32));
  v.setUint32(4, passo >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', chave, contador));
  const o = h[h.length - 1] & 15;
  const n = (((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000;
  return String(n).padStart(6, '0');
}

/**
 * Confere o código aceitando 30 s de diferença no relógio do celular.
 * Devolve o passo usado (para não aceitar o mesmo código duas vezes) ou null.
 */
export async function conferirCodigo(segredo: string, codigo: string, ultimoPassoUsado = 0, agoraMs = Date.now()) {
  if (!/^\d{6}$/.test(codigo)) return null;
  const atual = passoAtual(agoraMs);
  for (const p of [atual, atual - 1, atual + 1]) {
    if (p <= ultimoPassoUsado) continue;
    const esperado = await codigoDoPasso(segredo, p);
    let d = 0;
    for (let i = 0; i < 6; i++) d |= esperado.charCodeAt(i) ^ codigo.charCodeAt(i);
    if (d === 0) return p;
  }
  return null;
}

/** Link que o app autenticador entende (o QR code mostra este texto). */
export const linkAutenticador = (segredo: string, email: string) =>
  `otpauth://totp/${encodeURIComponent(`Meus Planos:${email}`)}?secret=${segredo}&issuer=${encodeURIComponent('Meus Planos')}&algorithm=SHA1&digits=6&period=${PASSO_SEGUNDOS}`;

/** Códigos de recuperação (para quando a pessoa perde o celular). Formato XXXX-XXXX. */
export function novosCodigosRecuperacao(qtd = 8) {
  return Array.from({ length: qtd }, () => {
    const s = base32(crypto.getRandomValues(new Uint8Array(5)));
    return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
  });
}
export const normalizarRecuperacao = (c: string) => c.toUpperCase().replace(/[^A-Z2-7]/g, '');
