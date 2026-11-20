import Dexie, { type Table } from 'dexie';

/**
 * Todos os dados ficam SOMENTE no aparelho da pessoa (IndexedDB).
 * Nada é enviado para servidor nenhum. Por isso o app funciona offline
 * e cada pessoa tem os próprios planos, privados.
 */

export type TipoPlano = 'casa' | 'carro' | 'equipamentos' | 'viagem' | 'outro';
export type PerfilRisco = 'conservador' | 'moderado' | 'arrojado';
export type Tema = 'claro' | 'escuro' | 'sistema';

export interface Perfil {
  id: 'eu';
  nome: string;
  /** Renda informada dos últimos 6 meses (mês no formato AAAA-MM). Pode variar: PJ, freela etc. */
  rendaMeses: { mes: string; valor: number }[];
  /** Estimativa de gasto mensal, usada até existirem gastos registrados suficientes. */
  gastoMensalEstimado: number;
  perfilRisco?: PerfilRisco;
  tema: Tema;
  metodo: 'notificacoes' | 'extrato' | 'manual';
  concluiuInicio: boolean;
  criadoEm: string;
}

export interface Plano {
  id?: number;
  nome: string;
  tipo: TipoPlano;
  meta: number;
  /** Quanto já está guardado fora dos investimentos cadastrados. */
  guardado: number;
  /** Porcentagem fixa do valor livre do mês que vai para este plano. */
  percentual: number;
  /** Data desejada (AAAA-MM), opcional. */
  prazo?: string;
  /** Respostas do questionário do plano (variam por tipo). */
  respostas: Record<string, unknown>;
  /** Detalhamento da meta calculada (rótulo → valor). */
  composicao?: { rotulo: string; valor: number }[];
  analiseIA?: { texto: string; geradaEm: string };
  criadoEm: string;
}

export type TipoMov = 'saida' | 'entrada';
export type OrigemMov = 'manual' | 'extrato' | 'notificacao';

export interface Movimento {
  id?: number;
  /** ISO completo (data e hora). Qualquer dia e horário é aceito. */
  data: string;
  valor: number;
  tipo: TipoMov;
  descricao: string;
  categoria: string;
  origem: OrigemMov;
  /** Assinatura para evitar duplicados ao importar o mesmo extrato duas vezes. */
  chave: string;
}

export type TipoInvestimento =
  | 'cofrinho'
  | 'cdb'
  | 'tesouro-selic'
  | 'tesouro-ipca'
  | 'tesouro-prefixado'
  | 'lci-lca'
  | 'poupanca'
  | 'fundo'
  | 'acoes-etf'
  | 'cripto'
  | 'outro';

export interface Investimento {
  id?: number;
  nome: string;
  tipo: TipoInvestimento;
  instituicao: string;
  saldo: number;
  aporte: number;
  frequencia: 'mensal' | 'anual';
  /** Rentabilidade informada: % do CDI (ex.: 100) ou % ao ano, conforme `indexador`. */
  rentabilidade?: number;
  indexador?: 'cdi' | 'aa';
  planoId?: number;
  atualizadoEm: string;
}

export interface Cache {
  chave: string;
  valor: unknown;
  em: string;
}

class BancoLocal extends Dexie {
  perfil!: Table<Perfil, string>;
  planos!: Table<Plano, number>;
  movimentos!: Table<Movimento, number>;
  investimentos!: Table<Investimento, number>;
  cache!: Table<Cache, string>;

  constructor() {
    super('meus-planos-financeiros');
    this.version(1).stores({
      perfil: 'id',
      planos: '++id, tipo',
      movimentos: '++id, data, tipo, categoria, &chave',
      investimentos: '++id, tipo, planoId',
      cache: 'chave',
    });
  }
}

export const db = new BancoLocal();

export async function salvarCache(chave: string, valor: unknown) {
  await db.cache.put({ chave, valor, em: new Date().toISOString() });
}

export async function lerCache<T>(chave: string): Promise<{ valor: T; em: string } | undefined> {
  const c = await db.cache.get(chave);
  return c ? { valor: c.valor as T, em: c.em } : undefined;
}

/** Cópia de segurança: a pessoa guarda o arquivo onde quiser. */
export async function exportarTudo() {
  return {
    versao: 1,
    exportadoEm: new Date().toISOString(),
    perfil: await db.perfil.toArray(),
    planos: await db.planos.toArray(),
    movimentos: await db.movimentos.toArray(),
    investimentos: await db.investimentos.toArray(),
  };
}

export async function importarTudo(dados: Awaited<ReturnType<typeof exportarTudo>>) {
  await db.transaction('rw', [db.perfil, db.planos, db.movimentos, db.investimentos], async () => {
    await Promise.all([db.perfil.clear(), db.planos.clear(), db.movimentos.clear(), db.investimentos.clear()]);
    await db.perfil.bulkPut(dados.perfil);
    await db.planos.bulkPut(dados.planos);
    await db.movimentos.bulkPut(dados.movimentos);
    await db.investimentos.bulkPut(dados.investimentos);
  });
}
