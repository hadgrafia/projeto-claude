import { describe, expect, it } from 'vitest';
import { lerComprovante, lerParametros } from './compartilhar';

describe('lançamento rápido (navegador)', () => {
  it('lê comprovante de Pix com valor e destinatário', () => {
    const r = lerComprovante('Comprovante de transferência\nPix enviado\nValor\nR$ 89,90\nPara\nPadaria Pão Quente LTDA\nCPF/CNPJ ***.123.456-**');
    expect(r?.valor).toBe(89.9);
    expect(r?.tipo).toBe('saida');
    expect(r?.local).toMatch(/Padaria Pão Quente/i);
  });
  it('lê comprovante que chegou numa linha só', () => {
    const r = lerComprovante('Comprovante Pix Valor R$ 89,90 Para Padaria Pão Quente LTDA CPF ***.123.456-** Instituição Banco X');
    expect(r?.valor).toBe(89.9);
    expect(r?.local).toMatch(/Padaria Pão Quente/i);
  });
  it('lê comprovante de valor recebido', () => {
    const r = lerComprovante('Pix recebido\nValor: R$ 1.250,00\nDe: Maria Souza');
    expect(r?.valor).toBe(1250);
    expect(r?.tipo).toBe('entrada');
  });
  it('lê o texto de uma notificação vindo do link de automação', () => {
    const r = lerParametros(new URLSearchParams({ app: 'Nubank', titulo: 'Compra aprovada', texto: 'Compra de R$ 45,90 APROVADA em MERCADO BOM PRECO' }));
    expect(r?.valor).toBe(45.9);
    expect(r?.tipo).toBe('saida');
    expect(r?.local).toMatch(/Mercado Bom Pre/i);
    expect(r?.origemTexto).toBe('Nubank');
  });
  it('aceita valor e lugar prontos (Atalhos do iPhone)', () => {
    const r = lerParametros(new URLSearchParams({ valor: 'R$ 32,50', local: 'Cafeteria Central' }));
    expect(r?.valor).toBe(32.5);
    expect(r?.local).toBe('Cafeteria Central');
  });
  it('ignora códigos de segurança e textos sem dinheiro', () => {
    expect(lerParametros(new URLSearchParams({ texto: 'Seu código de verificação é 123456' }))).toBeNull();
    expect(lerParametros(new URLSearchParams({}))).toBeNull();
  });
});
