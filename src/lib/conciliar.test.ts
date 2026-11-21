import { describe, expect, it } from 'vitest';
import type { Movimento } from '../db';
import { conciliar, jaRegistrado } from './conciliar';
import { lerLinhasExtrato } from './importar';

const mov = (o: Partial<Movimento>): Movimento => ({ id: Math.random(), data: '2026-11-10T15:30:00.000Z', valor: 25, tipo: 'saida', descricao: 'Gasto', categoria: 'Outros', origem: 'notificacao', chave: `n-${Math.random()}`, ...o });

describe('extrato não duplica o que já veio pelos avisos', () => {
  it('sorvete na Borelli: aviso + extrato = uma compra só', () => {
    const avisos = [mov({ valor: 25, local: 'Borelli', descricao: 'Borelli' })];
    const extrato = lerLinhasExtrato(['10/11/2026 COMPRA CARTAO BORELLI SORVETES -25,00', '11/11/2026 PADARIA PAO QUENTE -12,50'], 2026);
    const r = conciliar(extrato, avisos);
    expect(r[0].igual?.local).toBe('Borelli');
    expect(r[1].igual).toBeUndefined();
  });
  it('banco lança 2 dias depois: ainda reconhece', () => {
    const r = conciliar(lerLinhasExtrato(['12/11/2026 BORELLI -25,00'], 2026), [mov({ valor: 25, local: 'Borelli' })]);
    expect(r[0].igual).toBeDefined();
  });
  it('dois sorvetes de R$ 25 no mesmo dia, só um avisado: salva o outro', () => {
    const r = conciliar(lerLinhasExtrato(['10/11/2026 BORELLI -25,00', '10/11/2026 BORELLI -25,00'], 2026), [mov({ valor: 25, local: 'Borelli' })]);
    expect(r.filter((x) => x.igual).length).toBe(1);
    expect(r.filter((x) => !x.igual).length).toBe(1);
  });
  it('valor diferente ou mais de 3 dias: é outra compra', () => {
    expect(conciliar(lerLinhasExtrato(['10/11/2026 BORELLI -26,00'], 2026), [mov({ valor: 25 })])[0].igual).toBeUndefined();
    expect(conciliar(lerLinhasExtrato(['20/11/2026 BORELLI -25,00'], 2026), [mov({ valor: 25 })])[0].igual).toBeUndefined();
  });
  it('entre duas candidatas, escolhe a de nome parecido', () => {
    const r = conciliar(lerLinhasExtrato(['10/11/2026 BORELLI -25,00'], 2026), [mov({ id: 1, valor: 25, local: 'Farmácia' }), mov({ id: 2, valor: 25, local: 'Borelli' })]);
    expect(r[0].igual?.id).toBe(2);
  });
  it('mesmo extrato enviado duas vezes', () => {
    const lidos = lerLinhasExtrato(['10/11/2026 BORELLI -25,00'], 2026);
    const r = conciliar(lidos, [mov({ ...lidos[0], origem: 'extrato' })]);
    expect(r[0].exato).toBe(true);
  });
  it('lançamento rápido avisa quando já existe', () => {
    expect(jaRegistrado({ valor: 25, tipo: 'saida', data: '2026-11-10T20:00:00.000Z', local: 'Borelli' }, [mov({ valor: 25, local: 'Borelli' })])).toBeDefined();
  });
});

import { somarGuardado, totalGuardado } from './finance';
describe('guardado do plano não duplica o investimento', () => {
  it('mesmo valor no plano e no CDB ligado conta uma vez', () => {
    const plano = { id: 1, guardado: 5000 } as never;
    expect(totalGuardado(plano, [{ planoId: 1, saldo: 5000 } as never])).toBe(5000);
  });
  it('dinheiro fora do investimento soma normalmente', () => {
    expect(somarGuardado(800, 5000)).toBe(5800);
    expect(somarGuardado(800, 0)).toBe(800);
  });
});
