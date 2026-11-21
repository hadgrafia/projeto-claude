import { describe, expect, it } from 'vitest';
import { conferirSenha, hashSenha, iguais, problemaNaSenha } from './auth';


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
