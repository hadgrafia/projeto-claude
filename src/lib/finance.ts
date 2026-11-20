import type { Investimento, Movimento, Perfil, Plano } from '../db';
import { chaveMes, somarMeses, ultimosMeses } from './format';

export interface ResumoRenda {
  media: number;
  minimo: number;
  maximo: number;
  meses: { mes: string; valor: number; fonte: 'detectada' | 'informada' }[];
}

/**
 * Renda média dos últimos 6 meses. Para cada mês usa o que foi detectado
 * (notificações/extrato); se não houver nada detectado, usa o valor informado pela pessoa.
 */
export function resumoRenda(perfil: Perfil | undefined, movs: Movimento[], hoje = new Date()): ResumoRenda {
  const meses = ultimosMeses(6, hoje);
  const informada = new Map((perfil?.rendaMeses ?? []).map((r) => [r.mes, r.valor]));
  const detectada = new Map<string, number>();
  for (const m of movs) {
    if (m.tipo !== 'entrada') continue;
    const k = m.data.slice(0, 7);
    detectada.set(k, (detectada.get(k) ?? 0) + m.valor);
  }
  const lista: ResumoRenda['meses'] = [];
  for (const mes of meses) {
    const d = detectada.get(mes);
    if (d && d > 0) lista.push({ mes, valor: d, fonte: 'detectada' });
    else if (informada.has(mes)) lista.push({ mes, valor: informada.get(mes)!, fonte: 'informada' });
  }
  // Se a pessoa informou meses fora da janela atual (ex.: cadastro antigo), aproveita os mais recentes.
  if (lista.length === 0 && perfil?.rendaMeses.length) {
    for (const r of perfil.rendaMeses.slice(-6)) lista.push({ mes: r.mes, valor: r.valor, fonte: 'informada' });
  }
  const valores = lista.map((l) => l.valor);
  const media = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
  return {
    media,
    minimo: valores.length ? Math.min(...valores) : 0,
    maximo: valores.length ? Math.max(...valores) : 0,
    meses: lista,
  };
}

/** Soma de saídas por mês. */
export function gastosPorMes(movs: Movimento[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of movs) {
    if (m.tipo !== 'saida') continue;
    const k = m.data.slice(0, 7);
    out.set(k, (out.get(k) ?? 0) + m.valor);
  }
  return out;
}

/**
 * Gasto mensal típico: média dos últimos 3 meses completos com registros.
 * Sem histórico, usa a estimativa que a pessoa deu no início.
 */
export function gastoMensalTipico(perfil: Perfil | undefined, movs: Movimento[], hoje = new Date()): number {
  const porMes = gastosPorMes(movs);
  const atual = chaveMes(hoje);
  const completos = [1, 2, 3].map((i) => somarMeses(atual, -i)).filter((k) => (porMes.get(k) ?? 0) > 0);
  if (completos.length) return completos.reduce((a, k) => a + porMes.get(k)!, 0) / completos.length;
  return perfil?.gastoMensalEstimado ?? 0;
}

/** Quanto sobra por mês para dividir entre os planos. */
export function valorLivreMensal(perfil: Perfil | undefined, movs: Movimento[], hoje = new Date()) {
  const renda = resumoRenda(perfil, movs, hoje).media;
  const gasto = gastoMensalTipico(perfil, movs, hoje);
  return Math.max(0, renda - gasto);
}

/** Total já reservado para um plano: valor guardado + saldo dos investimentos ligados a ele. */
export function totalGuardado(plano: Plano, invs: Investimento[]) {
  return plano.guardado + invs.filter((i) => i.planoId === plano.id).reduce((a, i) => a + i.saldo, 0);
}

export const aporteDoPlano = (plano: Plano, livre: number) => (livre * plano.percentual) / 100;

/** Taxa mensal equivalente a uma taxa anual (em %). */
export const taxaMensal = (anualPct: number) => Math.pow(1 + anualPct / 100, 1 / 12) - 1;

/**
 * Meses até atingir a meta com aporte mensal e rendimento mensal `r` (decimal).
 * Retorna Infinity se não houver como chegar.
 */
export function mesesParaMeta(meta: number, atual: number, aporte: number, r = 0): number {
  if (atual >= meta) return 0;
  if (aporte <= 0 && r <= 0) return Infinity;
  let saldo = atual;
  for (let n = 1; n <= 1200; n++) {
    saldo = saldo * (1 + r) + aporte;
    if (saldo >= meta) return n;
  }
  return Infinity;
}

/** Aporte mensal necessário para atingir a meta em `n` meses com rendimento mensal `r`. */
export function aporteNecessario(meta: number, atual: number, n: number, r = 0): number {
  if (n <= 0) return Math.max(0, meta - atual);
  const fatorPV = Math.pow(1 + r, n);
  const falta = meta - atual * fatorPV;
  if (falta <= 0) return 0;
  const fatorPMT = r === 0 ? n : (fatorPV - 1) / r;
  return falta / fatorPMT;
}

/** Parcela pela Tabela Price. `i` = juros ao mês (decimal). */
export function parcelaPrice(valor: number, i: number, n: number): number {
  if (n <= 0) return valor;
  if (i <= 0) return valor / n;
  return (valor * i) / (1 - Math.pow(1 + i, -n));
}

/** Alíquota do IR regressivo para renda fixa (CDB, Tesouro), por prazo em dias. */
export function aliquotaIR(dias: number): number {
  if (dias <= 180) return 22.5;
  if (dias <= 360) return 20;
  if (dias <= 720) return 17.5;
  return 15;
}

/** Previsão no formato AAAA-MM a partir de hoje + n meses. */
export const previsao = (n: number, hoje = new Date()) => (Number.isFinite(n) ? somarMeses(chaveMes(hoje), n) : undefined);
