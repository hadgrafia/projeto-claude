import { describe, expect, it } from 'vitest';
import { avisoIgnoravel, lerNotificacao, modeloDoAviso, textoDoModelo } from './notificacao';

describe('cotação e mercado nunca viram gasto', () => {
  const cotacoes: [string, string][] = [
    ['Dólar hoje', 'Dólar comercial: compra R$ 5,43 e venda R$ 5,44'],
    ['USD/BRL', 'Compra R$ 5,43 · Venda R$ 5,44'],
    ['Câmbio', 'US$ 1 = R$ 5,61'],
    ['Seu alerta de cotação', 'O dólar chegou a R$ 5,50'],
    ['DÓLAR', 'R$ 5,72 (+0,8%)'],
    ['Moedas', 'Euro fecha a R$ 6,12'],
    ['Mercado', 'Ibovespa fecha em alta de 1,2%; dólar cai para R$ 5,40'],
    ['Bitcoin', 'BTC subiu para R$ 350.000,00'],
    ['Nubank', 'Dólar turismo: R$ 5,89. Quer comprar? Toque aqui'],
    ['Inter', 'O dolar caiu para R$ 5,38 hoje'],
    ['Wise', 'USD → BRL: R$ 5,47 agora'],
    // Acento "separado" (alguns apps mandam assim)
    ['Dólar', 'Cotação R$ 5,43'],
  ];
  it.each(cotacoes)('"%s — %s" é ignorado', (titulo, texto) => {
    expect(lerNotificacao('Banco', titulo, texto)).toBeNull();
  });

  const compras: [string, string, number][] = [
    ['Compra aprovada', 'Compra de R$ 45,90 aprovada em Padaria', 45.9],
    ['Compra internacional', 'Compra aprovada de R$ 110,00 (US$ 20,00) em AMAZON no cartão final 1234', 110],
    ['Pix recebido', 'Você recebeu R$ 500,00 de Ana', 500],
    ['Mercado Pago', 'Você pagou R$ 32,00 a Padaria Pão Quente', 32],
    ['Bolsa Família', 'Depósito de R$ 600,00 caiu na sua conta', 600],
    ['Compra aprovada', 'Compra de R$ 89,90 aprovada no PONTO DE VENDA 12', 89.9],
  ];
  it.each(compras)('"%s — %s" continua sendo lido', (titulo, texto, valor) => {
    expect(lerNotificacao('Banco', titulo, texto)?.valor).toBe(valor);
  });

  it('limite e fatura sozinhos não são gasto', () => {
    expect(avisoIgnoravel('Seu limite disponível agora é R$ 2.000,00')).toBe(true);
    expect(avisoIgnoravel('Sua fatura de R$ 800,00 vence amanhã')).toBe(true);
  });
});

describe('modelo do aviso (para "não era um gasto")', () => {
  it('mesmo tipo de aviso com números diferentes tem o mesmo modelo', async () => {
    expect(textoDoModelo('Dólar hoje', 'Compra R$ 5,43 · Venda R$ 5,44')).toBe('dolar hoje compra r$ # · venda r$ #');
    const a = await modeloDoAviso('Dólar hoje', 'Compra R$ 5,43 · Venda R$ 5,44');
    const b = await modeloDoAviso('Dólar hoje', 'Compra R$ 5,61 · Venda R$ 5,62');
    const c = await modeloDoAviso('Compra aprovada', 'Compra de R$ 45,90 aprovada em Padaria');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    // O leitor do Android calcula o mesmo código (LeitorPagamentosTest.modeloIgualAoDoApp).
    expect(a).toBe('cafaef6a8d96848e');
  });
});
