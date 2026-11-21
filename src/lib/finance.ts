import type { Investimento, Movimento, Perfil, Plano } from '../db';
import { chaveMes, mesesEntre, somarMeses } from './format';

export interface ResumoRenda {
  /** Renda mensal informada pela pessoa (salário mais recente). É a base de todos os cálculos. */
  mensal: number;
  /** Entradas registradas neste mês (notificações, extrato ou manual), só para conferência. */
  entradasDoMes: number;
}

export function resumoRenda(perfil: Perfil | undefined, movs: Movimento[], hoje = new Date()): ResumoRenda {
  const mes = chaveMes(hoje);
  const entradasDoMes = movs.filter((m) => m.tipo === 'entrada' && m.data.startsWith(mes)).reduce((a, m) => a + m.valor, 0);
  return { mensal: perfil?.rendaMensal ?? 0, entradasDoMes };
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
  const renda = resumoRenda(perfil, movs, hoje).mensal;
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

export interface AnalisePrazo {
  /** Aporte mensal com a porcentagem atual. */
  aporteAtual: number;
  /** Meses e data (AAAA-MM) com o aporte atual. */
  mesesAtual: number;
  dataAtual?: string;
  /** Mais cedo possível: colocando 100% do valor livre neste plano. */
  mesesMinimo: number;
  dataMinima?: string;
  /** Para cumprir a data desejada. */
  prazoMeses?: number;
  necessario?: number;
  pctNecessario?: number;
  /** 'ok' = chega no prazo; 'ajustar' = dá, aumentando a porcentagem; 'impossivel' = nem com 100% do livre; 'sem-prazo'. */
  situacao: 'ok' | 'ajustar' | 'impossivel' | 'sem-prazo';
  /** Quanto falta por mês além de todo o valor livre (só quando impossível). */
  faltaPorMes?: number;
}

/**
 * Compara a data que a pessoa deseja com a data realmente possível, considerando a renda
 * mensal, os gastos típicos, o que já foi guardado e o rendimento do dinheiro guardado.
 * Recalculado sempre que renda, gastos, investimentos ou a porcentagem mudam.
 */
export function analisarPrazo(o: { meta: number; guardado: number; livre: number; percentual: number; prazo?: string; rendimentoMensal?: number; outrosAporte?: number; hoje?: Date }): AnalisePrazo {
  const r = o.rendimentoMensal ?? 0;
  const outros = o.outrosAporte ?? 0;
  const aporteAtual = (o.livre * o.percentual) / 100 + outros;
  const mesesAtual = mesesParaMeta(o.meta, o.guardado, aporteAtual, r);
  const mesesMinimo = mesesParaMeta(o.meta, o.guardado, o.livre + outros, r);
  const base: AnalisePrazo = {
    aporteAtual,
    mesesAtual,
    dataAtual: previsao(mesesAtual, o.hoje),
    mesesMinimo,
    dataMinima: previsao(mesesMinimo, o.hoje),
    situacao: 'sem-prazo',
  };
  if (!o.prazo) return base;
  const prazoMeses = Math.max(1, mesesEntre(chaveMes(o.hoje ?? new Date()), o.prazo));
  const necessario = aporteNecessario(o.meta, o.guardado, prazoMeses, r);
  const proprio = Math.max(0, necessario - outros);
  const pctNecessario = o.livre > 0 ? (proprio / o.livre) * 100 : Infinity;
  const situacao = mesesAtual <= prazoMeses ? 'ok' : proprio <= o.livre ? 'ajustar' : 'impossivel';
  return { ...base, prazoMeses, necessario, pctNecessario, situacao, faltaPorMes: situacao === 'impossivel' ? proprio - o.livre : undefined };
}
