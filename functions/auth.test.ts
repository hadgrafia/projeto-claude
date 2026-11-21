import { afterEach, describe, expect, it, vi } from 'vitest';
import { conferirSenha, emailConfirmadoPeloAccess, hashSenha, iguais, problemaNaSenha } from './auth';

const b64url = (b: ArrayBuffer | string) =>
  btoa(typeof b === 'string' ? b : String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('conta: senha', () => {
  it('guarda só o hash e confere a senha certa', async () => {
    const h = await hashSenha('casaNova2027');
    expect(h).not.toContain('casaNova2027');
    expect(await conferirSenha('casaNova2027', h)).toBe(true);
    expect(await conferirSenha('casanova2027', h)).toBe(false);
  });
  it('recusa senhas fracas', () => {
    expect(problemaNaSenha('abc12', 'ana@x.com')).toMatch(/8 caracteres/);
    expect(problemaNaSenha('abcdefgh', 'ana@x.com')).toMatch(/letras e números/);
    expect(problemaNaSenha('12345678a', 'ana@x.com')).toMatch(/fácil/);
    expect(problemaNaSenha('mariana2027', 'mariana@x.com')).toMatch(/e-mail/);
    expect(problemaNaSenha('Terracota42', 'ana@x.com')).toBe('');
  });
  it('compara textos sem atalhos', () => {
    expect(iguais('abc', 'abc')).toBe(true);
    expect(iguais('abc', 'abd')).toBe(false);
    expect(iguais('abc', 'abcd')).toBe(false);
  });
});

describe('conta: confirmação do e-mail pelo Cloudflare Access', () => {
  afterEach(() => vi.unstubAllGlobals());
  const env = { ACCESS_EQUIPE: 'equipe.cloudflareaccess.com', ACCESS_AUD: 'aud123' } as never;

  async function cenario() {
    const par = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const jwk = { ...(await crypto.subtle.exportKey('jwk', par.publicKey)), kid: 'k1' };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }))));
    const assinar = async (dados: object, kid = 'k1') => {
      const c = b64url(JSON.stringify({ alg: 'RS256', kid }));
      const p = b64url(JSON.stringify(dados));
      const a = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', par.privateKey, new TextEncoder().encode(`${c}.${p}`));
      return `${c}.${p}.${b64url(a)}`;
    };
    const pedido = (jwt: string) => new Request('https://x/conta/confirmar', { headers: { 'Cf-Access-Jwt-Assertion': jwt } });
    return { assinar, pedido };
  }
  const valido = () => ({ aud: ['aud123'], iss: 'https://equipe.cloudflareaccess.com', exp: Math.floor(Date.now() / 1000) + 600, email: 'Ana@X.com' });

  it('aceita o token certo e devolve o e-mail', async () => {
    const { assinar, pedido } = await cenario();
    expect(await emailConfirmadoPeloAccess(env, pedido(await assinar(valido())))).toBe('ana@x.com');
  });
  it('recusa token de outro app, vencido, adulterado ou sem token', async () => {
    const { assinar, pedido } = await cenario();
    expect(await emailConfirmadoPeloAccess(env, pedido(await assinar({ ...valido(), aud: ['outro'] })))).toBe('');
    expect(await emailConfirmadoPeloAccess(env, pedido(await assinar({ ...valido(), exp: 1 })))).toBe('');
    expect(await emailConfirmadoPeloAccess(env, pedido(await assinar({ ...valido(), iss: 'https://falso.com' })))).toBe('');
    const bom = await assinar(valido());
    const [c, , a] = bom.split('.');
    const trocado = `${c}.${b64url(JSON.stringify({ ...valido(), email: 'intrusa@x.com' }))}.${a}`;
    expect(await emailConfirmadoPeloAccess(env, pedido(trocado))).toBe('');
    expect(await emailConfirmadoPeloAccess(env, new Request('https://x/'))).toBe('');
  });
});
