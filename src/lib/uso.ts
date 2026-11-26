import { Capacitor } from '@capacitor/core';
import { db, lerCache, salvarCache } from '../db';

/**
 * Estatística anônima de uso (para saber o que mais ajuda as pessoas).
 * Só nomes de recursos ("cartao", "agente:leo", "plano:viagem"), uma vez por dia por conta.
 * Nunca valores, textos, nomes de lugares ou qualquer dado da pessoa.
 */
const ROTAS: [RegExp, string][] = [
  [/^\/inicio$/, 'tela:inicio'],
  [/^\/gastos$/, 'tela:gastos'],
  [/^\/planos$/, 'tela:planos'],
  [/^\/planos\/novo$/, 'planos:criar'],
  [/^\/planos\/\d+\/editar$/, 'planos:editar'],
  [/^\/planos\/\d+$/, 'tela:plano'],
  [/^\/investir$/, 'tela:investir'],
  [/^\/feedback$/, 'tela:conselhos'],
  [/^\/compra$/, 'antes-de-comprar'],
  [/^\/cartao$/, 'cartao'],
  [/^\/assinaturas$/, 'assinaturas'],
  [/^\/agentes$/, 'tela:agentes'],
  [/^\/importar$/, 'enviar-extrato'],
  [/^\/lancar$/, 'lancamento-rapido'],
  [/^\/ajuda$/, 'duvidas'],
  [/^\/ajustes$/, 'tela:ajustes'],
  [/^\/pj$/, 'pj:das-e-notas'],
];

const hoje = () => new Date().toISOString().slice(0, 10);

export async function marcarUso(...recursos: string[]) {
  try {
    const c = (await lerCache<{ dia: string; recursos: string[]; enviados: number }>('uso-hoje'))?.valor;
    const atual = c?.dia === hoje() ? c : { dia: hoje(), recursos: [], enviados: 0 };
    const novos = recursos.filter((r) => !atual.recursos.includes(r));
    if (!novos.length) return;
    await salvarCache('uso-hoje', { ...atual, recursos: [...atual.recursos, ...novos].slice(0, 60) });
  } catch {
    /* estatística nunca atrapalha o app */
  }
}

export const marcarTela = (caminho: string) => {
  const r = ROTAS.find(([re]) => re.test(caminho))?.[1];
  if (r) marcarUso(r).catch(() => undefined);
};

/** Retrato do que a pessoa usa (sem valores): tipos de plano, cartão, assinaturas, aparelho… */
async function retrato() {
  const perfil = await db.perfil.get('eu');
  const planos = await db.planos.toArray();
  const out: string[] = [];
  for (const t of new Set(planos.map((p) => p.tipo))) out.push(`plano:${t}`);
  out.push(`planos:${planos.length >= 3 ? '3-ou-mais' : planos.length}`);
  if (planos.some((p) => p.conjunto)) out.push('plano-em-conjunto');
  if (planos.some((p) => p.prazo)) out.push('plano-com-data');
  if (perfil?.limiteCartao) out.push('usa:cartao');
  if (perfil?.assinaturas?.length) out.push('usa:assinaturas');
  if (perfil?.metodo) out.push(`registro:${perfil.metodo}`);
  if (perfil?.vinculo) out.push(`vinculo:${perfil.vinculo}`);
  if ((await db.investimentos.count()) > 0) out.push('usa:investimentos');
  const mes = new Date().toISOString().slice(0, 7);
  const movs = await db.movimentos.filter((m) => m.data.startsWith(mes)).toArray();
  if (movs.some((m) => m.origem === 'notificacao')) out.push('gastos:avisos-do-banco');
  if (movs.some((m) => m.origem === 'extrato')) out.push('gastos:extrato');
  if (movs.some((m) => m.origem === 'manual')) out.push('gastos:a-mao');
  const ua = navigator.userAgent;
  out.push(
    Capacitor.getPlatform() === 'android'
      ? 'aparelho:app-android'
      : /iPhone|iPad/.test(ua)
        ? 'aparelho:iphone'
        : /Android/.test(ua)
          ? 'aparelho:android-navegador'
          : 'aparelho:computador',
  );
  if ((await lerCache('bloqueio'))?.valor) out.push('usa:bloqueio-do-app');
  return out;
}

/** Manda os recursos de hoje (o servidor conta cada conta uma vez por recurso por dia). */
export async function enviarUso() {
  if (!navigator.onLine) return;
  try {
    await marcarUso(...(await retrato()));
    const c = (await lerCache<{ dia: string; recursos: string[]; enviados: number }>('uso-hoje'))?.valor;
    if (!c || c.recursos.length <= c.enviados) return;
    const r = await fetch('/api/uso', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recursos: c.recursos }) });
    if (r.ok) await salvarCache('uso-hoje', { ...c, enviados: c.recursos.length });
  } catch {
    /* tenta de novo depois */
  }
}
