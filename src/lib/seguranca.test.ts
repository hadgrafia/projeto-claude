import { describe, expect, it } from 'vitest';
import { cifrarJSON, decifrarJSON, novoId } from './conjunto';
import { cifrar, decifrar, pinValido } from './bloqueio';

describe('segurança', () => {
  it('plano em conjunto: cifra e decifra só com a chave certa', async () => {
    const chave = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const blob = await cifrarJSON({ nome: 'Casa Nova', meta: 40000 }, chave);
    expect(blob).not.toContain('Casa');
    expect(await decifrarJSON(blob, chave)).toEqual({ nome: 'Casa Nova', meta: 40000 });
    const outra = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await expect(decifrarJSON(blob, outra)).rejects.toThrow();
  });
  it('ids aleatórios e longos', () => {
    const a = novoId();
    expect(a).toMatch(/^[\w-]{32}$/);
    expect(novoId()).not.toBe(a);
  });
  it('cópia de segurança cifrada com a senha', async () => {
    const c = await cifrar('{"planos":[1]}', '480159');
    expect(c).not.toContain('"planos":[1]');
    expect(await decifrar(c, '480159')).toBe('{"planos":[1]}');
    await expect(decifrar(c, '111222')).rejects.toThrow();
  }, 20000);
  it('recusa senhas fracas', () => {
    expect(pinValido('123456')).toBe(false);
    expect(pinValido('111111')).toBe(false);
    expect(pinValido('12345')).toBe(false);
    expect(pinValido('480159')).toBe(true);
  });
});
