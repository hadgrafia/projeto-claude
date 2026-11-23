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
  /** Renda mensal, com base no salário (ou recebimento) mais recente. Pode ser ajustada a qualquer momento. */
  rendaMensal: number;
  rendaAtualizadaEm?: string;
  /** Formato antigo (6 meses). Só lido na atualização do banco. */
  rendaMeses?: { mes: string; valor: number }[];
  /** Estimativa de gasto mensal, usada até existirem gastos registrados suficientes. */
  gastoMensalEstimado: number;
  perfilRisco?: PerfilRisco;
  tema: Tema;
  metodo: 'notificacoes' | 'extrato' | 'manual';
  concluiuInicio: boolean;
  /** Compras a partir deste valor pedem finalidade e parcelamento (padrão R$ 100). */
  limiteAvisoCompra?: number;
  /** Cartão de crédito: limite total e quanto já está usado (informado pela pessoa). */
  limiteCartao?: number;
  limiteUsado?: number;
  /** Dia do mês em que a fatura fecha e em que vence (opcionais; sem eles, a compra cai na fatura do mês seguinte). */
  cartaoFechamento?: number;
  cartaoVencimento?: number;
  limiteUsadoEm?: string;
  /** Contato para avisos do app. */
  email?: string;
  celular?: string;
  /** agentes: false = os agentes só respondem quando a pessoa pergunta (sem avisos por conta própria). */
  avisos?: { celular: boolean; email: boolean; agentes?: boolean };
  /** Apps de pagamento que o Meus Planos pode ler (pacote no Android; nome para automações). */
  appsPagamento?: { pacote?: string; nome: string }[];
  /** Assinaturas (Netflix, Spotify, IA…) que a Lari lembra antes da cobrança. */
  assinaturas?: import('./lib/assinaturas').Assinatura[];
  /** true quando a pessoa já respondeu sobre assinaturas (mesmo que não tenha nenhuma). */
  assinaturasRespondido?: boolean;
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
  /** Plano em conjunto com familiares (dados cifrados de ponta a ponta no servidor). */
  conjunto?: Conjunto;
  criadoEm: string;
}

/** Resumo que cada participante compartilha. Nunca inclui a lista de gastos. */
export interface ResumoMembro {
  membroId: string;
  apelido: string;
  guardado: number;
  aporteMensal: number;
  livreMensal: number;
  rendaMedia?: number;
  sugestoes: { categoria: string; status: 'rever' | 'cortar'; ganho: number }[];
  atualizadoEm: string;
}

export interface Conjunto {
  id: string;
  membroId: string;
  /** Segredo deste aparelho para falar com o servidor (o servidor só guarda o hash). */
  segredo: string;
  /** Chave AES-256 do plano. Fica só nos aparelhos e no link de convite. */
  chave: string;
  versao: number;
  mostrarRenda: boolean;
  membros: ResumoMembro[];
  sincronizadoEm?: string;
}

export type TipoMov = 'saida' | 'entrada';
export type OrigemMov = 'manual' | 'extrato' | 'notificacao';

export type FormaPag = 'debito' | 'credito' | 'pix' | 'dinheiro' | 'boleto';

export interface Movimento {
  id?: number;
  /** ISO completo (data e hora). Qualquer dia e horário é aceito. */
  data: string;
  valor: number;
  tipo: TipoMov;
  descricao: string;
  /** Nome da loja ou lugar onde o dinheiro foi gasto (ou de quem veio, nas entradas). */
  local?: string;
  /** true quando não foi possível descobrir o lugar: o app pergunta para a pessoa. */
  localPendente?: boolean;
  /** true quando a compra passou do valor de aviso: o app pergunta a finalidade e o parcelamento. */
  detalhePendente?: boolean;
  /** App ou banco que avisou (só o nome do app, nunca o texto da notificação). */
  avisadoPor?: string;
  /** Como foi pago (só nos gastos). Crédito entra na fatura e desconta do limite do cartão. */
  forma?: FormaPag;
  /** Crédito parcelado: em quantas vezes (o valor é o total da compra, salvo quando há parcelaAtual). */
  parcelas?: number;
  /** Lido de uma fatura: esta linha é a parcela N (o valor já é o da parcela). */
  parcelaAtual?: number;
  /** Lido de uma fatura: mês (AAAA-MM) em que essa fatura vence. */
  faturaMes?: string;
  /** true quando o aviso ou o extrato não disse se foi débito ou crédito: o app pergunta. */
  formaPendente?: boolean;
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

export type Importancia = 'necessidade' | 'util' | 'desejo';

/** Compra planejada ou registrada, com o parcelamento escolhido. */
export interface Compra {
  id?: number;
  descricao: string;
  importancia: Importancia;
  valor: number;
  parcelas: number;
  /** Juros ao mês (%) — 0 quando sem juros. */
  juros: number;
  valorParcela: number;
  noCartao: boolean;
  /** Mês (AAAA-MM) da primeira parcela. */
  inicio: string;
  movimentoChave?: string;
  criadaEm: string;
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
  compras!: Table<Compra, number>;
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
    // v2: nome do lugar de cada gasto. Lançamentos antigos usam a descrição como lugar.
    this.version(2)
      .stores({ movimentos: '++id, data, tipo, categoria, &chave' })
      .upgrade((tx) =>
        tx
          .table('movimentos')
          .toCollection()
          .modify((m: Movimento) => {
            if (!m.local) m.local = m.descricao;
          }),
      );
    // v3: renda mensal única (o valor mais recente informado) no lugar dos 6 meses.
    this.version(3)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('perfil')
          .toCollection()
          .modify((p: Perfil) => {
            if (!p.rendaMensal) {
              const lista = [...(p.rendaMeses ?? [])].sort((a, b) => a.mes.localeCompare(b.mes));
              p.rendaMensal = lista.length ? lista[lista.length - 1].valor : 0;
              p.rendaAtualizadaEm = new Date().toISOString();
            }
            delete p.rendaMeses;
          }),
      );
    // v4: compras parceladas (conselheiro de compras e limite do cartão).
    this.version(4).stores({ compras: '++id, inicio, movimentoChave' });
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
    compras: await db.compras.toArray(),
  };
}

export async function importarTudo(dados: Awaited<ReturnType<typeof exportarTudo>>) {
  await db.transaction('rw', [db.perfil, db.planos, db.movimentos, db.investimentos, db.compras], async () => {
    await Promise.all([db.perfil.clear(), db.planos.clear(), db.movimentos.clear(), db.investimentos.clear(), db.compras.clear()]);
    await db.compras.bulkPut(dados.compras ?? []);
    await db.perfil.bulkPut(dados.perfil);
    await db.planos.bulkPut(dados.planos);
    await db.movimentos.bulkPut(dados.movimentos);
    await db.investimentos.bulkPut(dados.investimentos);
  });
}
