import { describe, expect, it } from 'vitest';
import { extrairLocal, limparLocal, localDoExtrato } from './lugar';
import { lerNotificacao } from './notificacao';

describe('nome do lugar nas notificações', () => {
  const casos: [string, string, string | undefined][] = [
    ['Compra aprovada', 'Compra de R$ 54,90 APROVADA em IFOOD *IFOOD para o cartão com final 1234.', 'Ifood'],
    ['Compra no débito', 'Compra no débito de R$ 23,50 em PADARIA PAO QUENTE aprovada', 'Padaria Pao Quente'],
    ['Itaú', 'Compra aprovada no seu cartão final 1234 - DROGASIL R$ 37,80 em 05/11 às 14:02', 'Drogasil'],
    ['Pix enviado', 'Você enviou um Pix de R$ 50,00 para Maria Silva', 'Maria Silva'],
    ['Pagamento', 'Você pagou R$ 18,40 a Uber', 'Uber'],
    ['Compra', 'Compra de R$ 120,00 em PG *LOJA DA ANA aprovada', 'Loja da Ana'],
    ['Compra aprovada', 'Compra de R$ 89,90 aprovada no cartão final 4321', undefined],
    ['Pix enviado', 'Pix de R$ 30,00 enviado com sucesso', undefined],
  ];
  for (const [titulo, texto, esperado] of casos) {
    it(`${texto} → ${esperado ?? '(perguntar)'}`, () => {
      const m = lerNotificacao('Banco', titulo, texto)!;
      expect(m).not.toBeNull();
      expect(m.local).toBe(esperado);
      expect(m.localPendente).toBe(!esperado);
    });
  }
  it('entrada: de quem veio', () => {
    expect(lerNotificacao('Banco', 'Pix recebido', 'Você recebeu um Pix de R$ 1.200,00 de JOAO PEREIRA')!.local).toBe('Joao Pereira');
  });
  it('limpa intermediadores', () => {
    expect(limparLocal('MERCADOPAGO*BARDOZE')).toBe('Bardoze');
    expect(limparLocal('NETFLIX.COM')).toBe('Netflix.com');
  });
  it('extrato', () => {
    expect(localDoExtrato('Compra no débito - SUPERMERCADO DIA')).toBe('Supermercado Dia');
    expect(localDoExtrato('Transferência enviada pelo Pix - Ana Souza - 123.456.789-00 - BANCO X Agência: 1 Conta: 2')).toBe('Ana Souza');
    expect(localDoExtrato('Pix enviado')).toBeUndefined();
  });
  it('não inventa lugar', () => {
    expect(extrairLocal('Compra de R$ 10,00 aprovada', 'saida')).toBeUndefined();
  });
});
