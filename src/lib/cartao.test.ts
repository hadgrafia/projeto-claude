import { describe, expect, it } from 'vitest';
import type { Compra, Movimento, Perfil } from '../db';
import { alertasCartao, estadoCartao, formaDoTexto, mesDaFatura } from './cartao';
import { contextoDeCompra, recomendar } from './compras';
import { aplicarTipoArquivo } from './importar';
import { lerNotificacao } from './notificacao';

const perfil = (p: Partial<Perfil> = {}) => ({ id: 'eu', limiteCartao: 5000, ...p }) as Perfil;
const mov = (m: Partial<Movimento>): Movimento => ({ data: '2026-11-10T15:00:00.000Z', valor: 100, tipo: 'saida', descricao: 'Loja', local: 'Loja', categoria: 'Outros', origem: 'manual', chave: `k${Math.random()}`, ...m });

describe('forma de pagamento no texto', () => {
  it('reconhece crédito, débito, Pix e parcelas', () => {
    expect(formaDoTexto('Compra no crédito de R$ 300,00 em LOJA em 3x')).toEqual({ forma: 'credito', parcelas: 3 });
    expect(formaDoTexto('Compra no débito aprovada').forma).toBe('debito');
    expect(formaDoTexto('Você enviou um Pix').forma).toBe('pix');
    expect(formaDoTexto('MAGAZINE PARC 03/10')).toEqual({ forma: 'credito', parcelas: 10, parcelaAtual: 3 });
    expect(formaDoTexto('Pagamento de fatura do cartão').forma).toBe('debito');
  });
  it('não inventa: sem pista, fica sem forma (o app pergunta)', () => {
    expect(formaDoTexto('Compra de R$ 89,90 aprovada no cartão final 4321').forma).toBeUndefined();
    expect(formaDoTexto('Compra em 05/11 às 14:02').forma).toBeUndefined();
    expect(formaDoTexto('Crédito em conta de salário').forma).toBeUndefined();
  });
  it('aviso do banco sem forma fica pendente; com forma, não', () => {
    expect(lerNotificacao('Nubank', 'Compra aprovada', 'Compra de R$ 89,90 aprovada em PADARIA')?.formaPendente).toBe(true);
    const c = lerNotificacao('Itaú', 'Compra no crédito', 'Compra no crédito de R$ 300,00 em LOJA X em 3x aprovada');
    expect(c?.forma).toBe('credito');
    expect(c?.parcelas).toBe(3);
    expect(c?.formaPendente).toBe(false);
    // "Limite disponível" no texto não apaga a compra; lembrete de fatura não é gasto.
    expect(lerNotificacao('Itaú', 'Compra aprovada', 'Compra de R$ 45,00 aprovada em FARMACIA. Limite disponível R$ 955,00')?.valor).toBe(45);
    expect(lerNotificacao('Nubank', 'Fatura', 'Sua fatura de R$ 800,00 vence amanhã')).toBeNull();
  });
});

describe('fatura e limite', () => {
  it('sem dias informados, a compra cai na fatura do mês seguinte', () => {
    expect(mesDaFatura(new Date(2026, 10, 20))).toBe('2026-12');
  });
  it('com fechamento e vencimento, respeita o ciclo', () => {
    // Fecha dia 3, vence dia 10: compra dia 2/11 → fecha 3/11, vence 10/11; compra dia 5/11 → vence 10/12.
    expect(mesDaFatura(new Date(2026, 10, 2), 3, 10)).toBe('2026-11');
    expect(mesDaFatura(new Date(2026, 10, 5), 3, 10)).toBe('2026-12');
    // Fecha dia 25, vence dia 5: compra dia 10 → fecha em novembro, vence em dezembro.
    expect(mesDaFatura(new Date(2026, 10, 10), 25, 5)).toBe('2026-12');
  });
  it('compras no crédito descontam do limite; parcelado entra nas próximas faturas', () => {
    const hoje = new Date(2026, 10, 15);
    const movs = [
      mov({ data: new Date(2026, 10, 10).toISOString(), valor: 600, forma: 'credito', parcelas: 3 }),
      mov({ data: new Date(2026, 10, 11).toISOString(), valor: 100, forma: 'credito' }),
      mov({ data: new Date(2026, 10, 11).toISOString(), valor: 999, forma: 'debito' }),
    ];
    const e = estadoCartao(perfil(), [], movs, hoje);
    expect(e.usado).toBe(700);
    expect(e.disponivel).toBe(4300);
    expect(e.faturas.find((f) => f.mes === '2026-12')?.valor).toBe(300);
    expect(e.faturas.find((f) => f.mes === '2027-01')?.valor).toBe(200);
    expect(e.faturas.find((f) => f.mes === '2027-02')?.valor).toBe(200);
  });
  it('compra com detalhes (tabela compras) não conta duas vezes com o gasto ligado', () => {
    const m = mov({ chave: 'n-1', valor: 1200, forma: 'credito', parcelas: 12 });
    const c: Compra = { descricao: 'TV', importancia: 'util', valor: 1200, parcelas: 12, juros: 0, valorParcela: 100, noCartao: true, inicio: '2026-12', movimentoChave: 'n-1', criadaEm: '2026-11-10T15:00:00.000Z' };
    const e = estadoCartao(perfil(), [c], [m], new Date(2026, 10, 15));
    expect(e.usado).toBe(1200);
    expect(e.itens).toHaveLength(1);
  });
  it('alerta vermelho quando o limite passa da renda', () => {
    const e = estadoCartao(perfil({ limiteCartao: 8000 }), [], [], new Date(2026, 10, 15));
    const a = alertasCartao(e, 3000, 2000);
    expect(a.limiteAcimaDaRenda).toBe(true);
    expect(a.limiteAcimaDeTudo).toBe(true);
    expect(a.usoSeguroMes).toBe(900);
    expect(alertasCartao(e, 9000, 0).limiteAcimaDaRenda).toBe(false);
  });
  it('fatura alta e fatura acima da renda', () => {
    const e = estadoCartao(perfil(), [], [mov({ data: new Date(2026, 10, 10).toISOString(), valor: 3500, forma: 'credito' })], new Date(2026, 10, 15));
    const a = alertasCartao(e, 3000, 200);
    expect(a.faturaAlta).toBe(true);
    expect(a.tirariaDosInvestimentos).toBe(500);
    expect(a.semCobertura).toBe(true);
  });
});

describe('antes de comprar olha a fatura', () => {
  it('não recomenda quando a fatura com a compra passa da renda', () => {
    const movs = [mov({ data: new Date().toISOString(), valor: 2800, forma: 'credito' })];
    const ctx = contextoDeCompra({ perfil: perfil(), compras: [], movimentos: movs, renda: 3000, livre: 1500, aportePlanos: 0 });
    expect(ctx.faturaAtual).toBe(2800);
    const r = recomendar({ valor: 400, importancia: 'necessidade', maxSemJuros: 1, noCartao: true }, ctx);
    expect(r.decisao).toBe('nao-cabe');
    expect(r.explicacao[0]).toContain('fatura');
  });
  it('fora do cartão, a fatura não pesa', () => {
    const movs = [mov({ data: new Date().toISOString(), valor: 2800, forma: 'credito' })];
    const ctx = contextoDeCompra({ perfil: perfil(), compras: [], movimentos: movs, renda: 3000, livre: 1500, aportePlanos: 0 });
    expect(recomendar({ valor: 100, importancia: 'necessidade', maxSemJuros: 1, noCartao: false }, ctx).decisao).toBe('avista');
  });
});

describe('enviar extrato ou fatura', () => {
  const lidos = [
    mov({ descricao: 'MAGAZINE PARC 02/05', valor: 50, tipo: 'entrada', origem: 'extrato' }),
    mov({ descricao: 'PADARIA', valor: 20, tipo: 'entrada', origem: 'extrato' }),
    mov({ descricao: 'Pagamento recebido', valor: 900, tipo: 'saida', origem: 'extrato' }),
  ];
  it('fatura: tudo no crédito, parcela lida e pagamento da fatura fora', () => {
    const r = aplicarTipoArquivo(lidos, 'fatura', perfil(), '2026-12');
    expect(r).toHaveLength(2);
    expect(r.every((m) => m.tipo === 'saida' && m.forma === 'credito')).toBe(true);
    expect(r[0]).toMatchObject({ parcelas: 5, parcelaAtual: 2, faturaMes: '2026-12' });
    const e = estadoCartao(perfil(), [], r.map((m, i) => ({ ...m, id: i })), new Date(2026, 10, 15));
    // Parcela 2 de 5 na fatura de dezembro: faltam 2/5..5/5 = 4 × R$ 50.
    expect(e.faturas.find((f) => f.mes === '2026-12')?.valor).toBe(70);
    expect(e.faturas.find((f) => f.mes === '2027-02')?.valor).toBe(50);
  });
  it('extrato da conta: débito; "não sei": pergunta', () => {
    const conta = aplicarTipoArquivo([mov({ descricao: 'COMPRA MERCADO', origem: 'extrato' })], 'conta');
    expect(conta[0]).toMatchObject({ forma: 'debito', formaPendente: false });
    const misto = aplicarTipoArquivo([mov({ descricao: 'COMPRA MERCADO', origem: 'extrato' })], 'misto');
    expect(misto[0].formaPendente).toBe(true);
  });
});

describe('quanto gastar no cartão para chegar nos planos', () => {
  it('renda − gastos fora do cartão − o que o plano precisa', async () => {
    const { tetoCartaoPorPlanos } = await import('./cartao');
    const hoje = new Date(2026, 10, 23);
    // Outubro: R$ 1.500 no total, R$ 500 no crédito → fora do cartão R$ 1.000.
    const movs = [
      mov({ data: new Date(2026, 9, 5).toISOString(), valor: 1000, forma: 'debito' }),
      mov({ data: new Date(2026, 9, 6).toISOString(), valor: 500, forma: 'credito' }),
    ];
    const t = tetoCartaoPorPlanos(4000, 1500, movs, [
      { id: 1, nome: 'Casa', prazo: '2028-12', precisaPorMes: 1800 },
      { id: 2, nome: 'Viagem', prazo: '2027-07', precisaPorMes: 600 },
    ], hoje);
    expect(t.cartaoTipico).toBe(500);
    expect(t.foraDoCartao).toBe(1000);
    expect(t.porPlano.map((p) => p.teto)).toEqual([1200, 2400]);
    expect(t.todos).toEqual({ precisa: 2400, teto: 600 });
  });
  it('prazo que não fecha fica negativo', async () => {
    const { tetoCartaoPorPlanos } = await import('./cartao');
    const t = tetoCartaoPorPlanos(3000, 2500, [], [{ id: 1, nome: 'Carro', prazo: '2027-01', precisaPorMes: 900 }]);
    expect(t.porPlano[0].teto).toBe(-400);
  });
});
