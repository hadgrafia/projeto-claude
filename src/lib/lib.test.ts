import { describe, expect, it } from 'vitest';
import type { Movimento } from '../db';
import { analisarMes } from './feedback';
import { aliquotaIR, analisarPrazo, aporteNecessario, mesesParaMeta, parcelaPrice, resumoRenda } from './finance';
import { lerValor } from './format';
import { lerCSV, lerLinhasExtrato, lerOFX } from './importar';
import { recomendar } from './invest';
import { lerNotificacao } from './notificacao';
import { PLANOS, respostasPadrao } from './planos';

describe('valores', () => {
  it('lê formatos brasileiros', () => {
    expect(lerValor('1.234,56')).toBe(1234.56);
    expect(lerValor('R$ 54,90')).toBe(54.9);
    expect(lerValor('-120.50')).toBe(-120.5);
    expect(lerValor('15.000')).toBe(15000);
  });
});

describe('extratos', () => {
  it('CSV de conta (negativo = gasto)', () => {
    const m = lerCSV('Data,Valor,Identificador,Descrição\n05/11/2026,-54.90,abc,IFOOD *PEDIDO\n06/11/2026,1200.00,def,Pix recebido Cliente');
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ tipo: 'saida', valor: 54.9, categoria: 'Delivery' });
    expect(m[1]).toMatchObject({ tipo: 'entrada', valor: 1200 });
  });
  it('CSV de fatura (todos positivos = gastos)', () => {
    const m = lerCSV('date,title,amount\n2026-11-03,Netflix.com,39.90\n2026-11-04,Uber Trip,18.40');
    expect(m.every((x) => x.tipo === 'saida')).toBe(true);
    expect(m[0].categoria).toBe('Assinaturas');
  });
  it('OFX', () => {
    const m = lerOFX('<OFX><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105120000<TRNAMT>-126.35<MEMO>SUPERMERCADO DIA</STMTTRN><STMTTRN><TRNAMT>3200.00<DTPOSTED>20261101<MEMO>SALARIO</STMTTRN></OFX>');
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ tipo: 'saida', valor: 126.35, categoria: 'Mercado' });
    expect(m[1].tipo).toBe('entrada');
  });
  it('linhas de PDF', () => {
    const m = lerLinhasExtrato(['05/11/2026 Compra no débito IFOOD 54,90 1.000,00', '06/11 Pix recebido Fulano 1.200,00', '07/11 Saldo do dia 2.145,10']);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ tipo: 'saida', valor: 54.9 });
    expect(m[1]).toMatchObject({ tipo: 'entrada', valor: 1200 });
  });
});

describe('notificações', () => {
  it('compra aprovada', () => {
    const m = lerNotificacao('Banco', 'Compra aprovada', 'Compra de R$ 54,90 aprovada em IFOOD');
    expect(m).toMatchObject({ tipo: 'saida', valor: 54.9, categoria: 'Delivery' });
  });
  it('pix recebido', () => {
    expect(lerNotificacao('Banco', 'Pix recebido', 'Você recebeu um Pix de R$ 1.200,00 de Maria')).toMatchObject({ tipo: 'entrada', valor: 1200 });
  });
  it('ignora o que não é dinheiro', () => {
    expect(lerNotificacao('WhatsApp', 'Ana', 'Oi, tudo bem?')).toBeNull();
    expect(lerNotificacao('Banco', 'Seu código de verificação', 'R$ 0,00 código 1234')).toBeNull();
  });
});

describe('finanças', () => {
  it('renda mensal: usa o salário mais recente informado', () => {
    const hoje = new Date(2026, 10, 20);
    const r = resumoRenda(
      { id: 'eu', nome: '', rendaMensal: 3500, gastoMensalEstimado: 0, tema: 'sistema', metodo: 'extrato', concluiuInicio: true, criadoEm: '' },
      [{ data: new Date(2026, 10, 5).toISOString(), valor: 1200, tipo: 'entrada', descricao: 'Freela', categoria: 'Entrada', origem: 'manual', chave: 'x' }],
      hoje,
    );
    expect(r.mensal).toBe(3500);
    expect(r.entradasDoMes).toBe(1200);
  });
  it('projeções', () => {
    expect(mesesParaMeta(1000, 0, 100)).toBe(10);
    expect(mesesParaMeta(1000, 0, 0)).toBe(Infinity);
    expect(aporteNecessario(1200, 0, 12)).toBeCloseTo(100);
    expect(parcelaPrice(10000, 0, 10)).toBe(1000);
    expect(parcelaPrice(10000, 0.02, 12)).toBeCloseTo(945.6, 1);
    expect(aliquotaIR(100)).toBe(22.5);
    expect(aliquotaIR(800)).toBe(15);
  });
});

describe('planos', () => {
  it('casa nova em SP, mobiliada, reserva de 6 meses', () => {
    const r = PLANOS.casa.calcular(respostasPadrao('casa'));
    expect(r.composicao[0].rotulo).toContain('6 meses');
    expect(r.meta).toBeGreaterThan(35000);
    expect(r.meta).toBeLessThan(45000);
    expect(r.fontes.join(' ')).toContain('FipeZap');
  });
  it('carro financiado', () => {
    const r = PLANOS.carro.calcular({ preco: 80000, pagamento: 'financiado', entrada: 20000, parcelas: 48, juros: 1.8, ipva: 4 });
    expect(r.composicao[0]).toEqual({ rotulo: 'Entrada', valor: 20000 });
    expect(r.mensal?.[0].valor).toBeGreaterThan(1700);
  });
  it('equipamentos somam a lista', () => {
    expect(PLANOS.equipamentos.calcular({ itens: 'Notebook 4500\nMonitor: R$ 1.200' }).meta).toBe(5700);
  });
});

describe('investimentos', () => {
  it('prazo curto nunca recomenda cripto', () => {
    const r = recomendar(12, 'arrojado', 14);
    expect(r.horizonte).toBe('curto');
    expect(r.opcoes.some((o) => o.nome.includes('Bitcoin'))).toBe(false);
  });
  it('prazo longo arrojado inclui ações e bitcoin', () => {
    const r = recomendar(96, 'arrojado', 14);
    expect(r.alocacao.some((a) => a.classe === 'Bitcoin')).toBe(true);
  });
});

describe('feedback', () => {
  it('sugere cortar delivery alto', () => {
    const hoje = new Date();
    const d = (dia: number, h = 23) => new Date(hoje.getFullYear(), hoje.getMonth(), dia, h).toISOString();
    const movs: Movimento[] = Array.from({ length: 6 }, (_, i) => ({ data: d(i + 1), valor: 70, tipo: 'saida', descricao: 'iFood', categoria: 'Delivery', origem: 'notificacao', chave: String(i) }));
    const s = analisarMes(movs, 3000, hoje);
    expect(s[0]).toMatchObject({ categoria: 'Delivery', status: 'cortar' });
    expect(s[0].ganhoMensal).toBeGreaterThan(0);
  });
});

describe('prazo desejado x prazo possível', () => {
  const hoje = new Date(2026, 10, 20);
  it('chega no prazo com a porcentagem atual', () => {
    const a = analisarPrazo({ meta: 12000, guardado: 0, livre: 1000, percentual: 100, prazo: '2027-11', hoje });
    expect(a.situacao).toBe('ok');
    expect(a.dataAtual).toBe('2027-11');
  });
  it('dá para chegar aumentando a porcentagem', () => {
    const a = analisarPrazo({ meta: 12000, guardado: 0, livre: 1000, percentual: 50, prazo: '2027-11', hoje });
    expect(a.situacao).toBe('ajustar');
    expect(Math.round(a.pctNecessario!)).toBe(100);
  });
  it('impossível no prazo: mostra a data real e quanto falta', () => {
    const a = analisarPrazo({ meta: 40000, guardado: 0, livre: 1000, percentual: 100, prazo: '2027-11', hoje });
    expect(a.situacao).toBe('impossivel');
    expect(a.dataMinima).toBe('2030-03');
    expect(Math.round(a.faltaPorMes!)).toBe(2333);
  });
});
