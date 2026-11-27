import { describe, expect, it } from 'vitest';
import type { Compra } from '../db';
import { compromissoDoMes, limiteDisponivel, recomendar } from './compras';

const ctx = { renda: 3500, livre: 1000, compromissoMensal: 0, aportePlanos: 1000 };

describe('conselheiro de compras', () => {
  it('compra pequena: à vista', () => {
    const r = recomendar({ valor: 150, importancia: 'util', maxSemJuros: 3, noCartao: true }, ctx);
    expect(r.decisao).toBe('avista');
  });
  it('compra média: menor número de parcelas sem juros que cabe', () => {
    // espaço = min(300, 525) = 300/mês → 900 em 3x de 300
    const r = recomendar({ valor: 900, importancia: 'necessidade', maxSemJuros: 10, noCartao: true }, ctx);
    expect(r.decisao).toBe('sem-juros');
    expect(r.parcelas).toBe(3);
    expect(r.titulo).toBe('Parcele em 3x sem juros');
  });
  it('desejo caro: adiar', () => {
    const r = recomendar({ valor: 4000, importancia: 'desejo', maxSemJuros: 10, noCartao: true }, ctx);
    expect(r.decisao).toBe('adiar');
    expect(r.mesesParaJuntar).toBe(14);
  });
  it('necessidade sem opção sem juros: com juros, avisando o custo', () => {
    const r = recomendar({ valor: 2000, importancia: 'necessidade', maxSemJuros: 1, comJuros: { parcelas: 12, total: 2600 }, noCartao: true }, ctx);
    expect(r.decisao).toBe('com-juros');
    expect(r.totalPago).toBeGreaterThan(2000);
  });
  it('parcelas atuais ocupam o espaço: não cabe', () => {
    const r = recomendar({ valor: 900, importancia: 'necessidade', maxSemJuros: 3, noCartao: false }, { ...ctx, compromissoMensal: 350 });
    expect(r.decisao).toBe('nao-cabe');
  });
  it('avisa quando passa do limite do cartão', () => {
    const r = recomendar({ valor: 900, importancia: 'necessidade', maxSemJuros: 10, noCartao: true }, { ...ctx, limiteDisponivel: 500, limiteTotal: 2000 });
    expect(r.alertas.join(' ')).toContain('limite disponível');
  });
  it('soma parcelas do mês e calcula limite disponível', () => {
    const c: Compra = { descricao: 'TV', importancia: 'util', valor: 1200, parcelas: 4, juros: 0, valorParcela: 300, noCartao: true, inicio: '2026-11', criadaEm: '2026-11-21T00:00:00Z' };
    expect(compromissoDoMes([c], '2027-02')).toBe(300);
    expect(compromissoDoMes([c], '2027-03')).toBe(0);
    expect(limiteDisponivel(3000, 1000, '2026-11-01T00:00:00Z', [c])).toBe(800);
  });
});
