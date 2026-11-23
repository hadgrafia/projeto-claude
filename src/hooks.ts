import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from './db';
import { gastoMensalTipico, resumoRenda, totalGuardado, valorLivreMensal, aporteDoPlano, mesesParaMeta, previsao, aporteNecessario, taxaMensal } from './lib/finance';
import { mesesEntre, chaveMes } from './lib/format';
import { somaOutros } from './lib/conjunto';
import { cdiDaSelic, liquidoAnual, obterSelic, type Selic } from './lib/invest';

/** Todos os dados do app, ao vivo, lidos do aparelho. */
export function useDados() {
  const perfil = useLiveQuery(() => db.perfil.get('eu'), []);
  const planos = useLiveQuery(() => db.planos.toArray(), []) ?? [];
  const movimentos = useLiveQuery(() => db.movimentos.orderBy('data').reverse().toArray(), []) ?? [];
  const investimentos = useLiveQuery(() => db.investimentos.toArray(), []) ?? [];
  const qtdPerfis = useLiveQuery(() => db.perfil.count(), []);
  const carregado = qtdPerfis !== undefined;

  return useMemo(() => {
    const renda = resumoRenda(perfil, movimentos);
    const gasto = gastoMensalTipico(perfil, movimentos);
    const livre = valorLivreMensal(perfil, movimentos);
    const somaPct = planos.reduce((a, p) => a + p.percentual, 0);
    return { perfil, planos, movimentos, investimentos, renda, gasto, livre, somaPct, carregado };
  }, [perfil, planos, movimentos, investimentos, carregado]);
}

export function useSelic() {
  const [selic, setSelic] = useState<Selic>();
  useEffect(() => {
    let vivo = true;
    obterSelic().then((s) => vivo && setSelic(s));
    const volta = () => obterSelic().then((s) => vivo && setSelic(s));
    window.addEventListener('online', volta);
    return () => {
      vivo = false;
      window.removeEventListener('online', volta);
    };
  }, []);
  return selic;
}

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true);
    const b = () => setOn(false);
    window.addEventListener('online', a);
    window.addEventListener('offline', b);
    return () => {
      window.removeEventListener('online', a);
      window.removeEventListener('offline', b);
    };
  }, []);
  return on;
}

/** Números de um plano: progresso, aporte, previsão e quanto precisaria para cumprir o prazo. */
/**
 * Quanto a PESSOA precisa guardar por mês para o plano: para chegar na data desejada
 * (descontando o que outras pessoas do plano em conjunto já colocam); sem data, o que já separa hoje.
 */
export function minhaParteMes(s: { necessario?: number; aporte: number; meuAporte: number }) {
  if (s.necessario === undefined) return s.meuAporte;
  return Math.max(0, s.necessario - (s.aporte - s.meuAporte));
}

export function situacaoPlano(
  plano: import('./db').Plano,
  investimentos: import('./db').Investimento[],
  livre: number,
  selic?: number,
) {
  const outros = somaOutros(plano);
  const meuGuardado = totalGuardado(plano, investimentos);
  const meuAporte = aporteDoPlano(plano, livre);
  const guardado = meuGuardado + outros.guardado;
  const aporte = meuAporte + outros.aporte;
  const pct = plano.meta > 0 ? (guardado / plano.meta) * 100 : 0;
  const prazoMeses = plano.prazo ? Math.max(1, mesesEntre(chaveMes(new Date()), plano.prazo)) : undefined;
  const horizonte = prazoMeses ?? 24;
  const rendimentoAa = selic ? liquidoAnual(cdiDaSelic(selic), 100, horizonte) : 0;
  const r = taxaMensal(rendimentoAa);
  const meses = mesesParaMeta(plano.meta, guardado, aporte, r);
  const necessario = prazoMeses ? aporteNecessario(plano.meta, guardado, prazoMeses, r) : undefined;
  return { guardado, aporte, meuGuardado, meuAporte, pct, meses, previsao: previsao(meses), prazoMeses, necessario, rendimentoAa };
}
