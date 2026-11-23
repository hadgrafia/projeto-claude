import { describe, expect, it } from 'vitest';
import { base32, codigoDoPasso, conferirCodigo, deBase32, novosCodigosRecuperacao, PASSO_SEGUNDOS } from './totp';
import { descreverAparelho } from './auth';

// Vetores oficiais da RFC 6238 (segredo "12345678901234567890", SHA-1), últimos 6 dígitos.
const SEGREDO = base32(new TextEncoder().encode('12345678901234567890'));

describe('código do app autenticador (TOTP)', () => {
  it('base32 vai e volta', () => {
    expect(SEGREDO).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(new TextDecoder().decode(deBase32(SEGREDO))).toBe('12345678901234567890');
  });
  it('bate com os vetores oficiais', async () => {
    expect(await codigoDoPasso(SEGREDO, Math.floor(59 / PASSO_SEGUNDOS))).toBe('287082');
    expect(await codigoDoPasso(SEGREDO, Math.floor(1111111109 / PASSO_SEGUNDOS))).toBe('081804');
    expect(await codigoDoPasso(SEGREDO, Math.floor(1234567890 / PASSO_SEGUNDOS))).toBe('005924');
    expect(await codigoDoPasso(SEGREDO, Math.floor(2000000000 / PASSO_SEGUNDOS))).toBe('279037');
  });
  it('aceita 30 s de diferença e nunca o mesmo código duas vezes', async () => {
    const agora = 1111111109_000;
    const passo = Math.floor(agora / 1000 / PASSO_SEGUNDOS);
    const usado = await conferirCodigo(SEGREDO, '081804', 0, agora);
    expect(usado).toBe(passo);
    expect(await conferirCodigo(SEGREDO, '081804', usado!, agora)).toBeNull();
    expect(await conferirCodigo(SEGREDO, '081804', 0, agora + 30_000)).toBe(passo);
    expect(await conferirCodigo(SEGREDO, '081804', 0, agora + 120_000)).toBeNull();
    expect(await conferirCodigo(SEGREDO, '000000', 0, agora)).toBeNull();
    expect(await conferirCodigo(SEGREDO, '12ab56', 0, agora)).toBeNull();
  });
  it('códigos de recuperação no formato XXXX-XXXX, todos diferentes', () => {
    const c = novosCodigosRecuperacao();
    expect(c).toHaveLength(8);
    expect(new Set(c).size).toBe(8);
    for (const x of c) expect(x).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/);
  });
});

describe('aparelhos conectados', () => {
  it('descreve só o tipo de aparelho', () => {
    expect(descreverAparelho('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36')).toBe('Android · Chrome');
    expect(descreverAparelho('Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36'.replace('wv)', '; wv)'))).toBe('App Android');
    expect(descreverAparelho('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('iPhone · Safari');
    expect(descreverAparelho('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0')).toBe('Windows · Edge');
  });
});
