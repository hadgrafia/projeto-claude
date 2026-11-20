import { lerCache, salvarCache, type PerfilRisco, type TipoInvestimento } from '../db';
import { aliquotaIR, taxaMensal } from './finance';

export const NOMES_INVESTIMENTO: Record<TipoInvestimento, string> = {
  cofrinho: 'Cofrinho / caixinha',
  cdb: 'CDB',
  'tesouro-selic': 'Tesouro Selic',
  'tesouro-ipca': 'Tesouro IPCA+',
  'tesouro-prefixado': 'Tesouro Prefixado',
  'lci-lca': 'LCI / LCA',
  poupanca: 'Poupança',
  fundo: 'Fundo de investimento',
  'acoes-etf': 'Ações / ETFs',
  cripto: 'Bitcoin / cripto',
  outro: 'Outro',
};

/* ---------------- Perfil de investidor ---------------- */

export const PERGUNTAS_PERFIL = [
  {
    id: 'queda',
    texto: 'Se seu investimento caísse 15% em um mês, você…',
    opcoes: [
      { rotulo: 'Resgataria tudo na hora', pontos: 0 },
      { rotulo: 'Ficaria preocupada, mas esperaria', pontos: 1 },
      { rotulo: 'Aproveitaria para investir mais', pontos: 2 },
    ],
  },
  {
    id: 'experiencia',
    texto: 'Quais investimentos você já usou?',
    opcoes: [
      { rotulo: 'Só poupança ou nenhum', pontos: 0 },
      { rotulo: 'CDB, Tesouro, cofrinhos', pontos: 1 },
      { rotulo: 'Ações, fundos, ETFs ou cripto', pontos: 2 },
    ],
  },
  {
    id: 'objetivo',
    texto: 'O que é mais importante para você?',
    opcoes: [
      { rotulo: 'Não perder dinheiro', pontos: 0 },
      { rotulo: 'Equilíbrio entre segurança e ganho', pontos: 1 },
      { rotulo: 'Ganhar mais, aceitando oscilações', pontos: 2 },
    ],
  },
] as const;

export function calcularPerfil(pontos: number[]): PerfilRisco {
  const t = pontos.reduce((a, b) => a + b, 0);
  return t <= 2 ? 'conservador' : t <= 4 ? 'moderado' : 'arrojado';
}

/* ---------------- Taxa Selic (Banco Central, gratuita e oficial) ---------------- */

export interface Selic {
  valor: number; // % ao ano
  data: string; // data informada pelo BC
  consultadoEm: string;
  offline?: boolean;
}

/** Busca a meta da Selic na API pública do Banco Central (SGS, série 432). Guarda para uso offline. */
export async function obterSelic(): Promise<Selic | undefined> {
  const guardada = await lerCache<Selic>('selic');
  const fresca = guardada && Date.now() - new Date(guardada.em).getTime() < 12 * 3600 * 1000;
  if (fresca) return guardada!.valor;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json', { signal: ctrl.signal });
    clearTimeout(t);
    const [ultimo] = (await r.json()) as { data: string; valor: string }[];
    const selic: Selic = { valor: parseFloat(ultimo.valor), data: ultimo.data, consultadoEm: new Date().toISOString() };
    if (Number.isFinite(selic.valor)) {
      await salvarCache('selic', selic);
      return selic;
    }
  } catch {
    /* sem internet: usa o último valor guardado */
  }
  return guardada ? { ...guardada.valor, offline: true } : undefined;
}

/** CDI anual aproximado: fica cerca de 0,10 ponto abaixo da Selic. */
export const cdiDaSelic = (selic: number) => Math.max(0, selic - 0.1);

/** Rendimento líquido anual (após IR) de um título que paga `pctCDI`% do CDI, pelo prazo em meses. */
export function liquidoAnual(cdi: number, pctCDI: number, meses: number, isento = false) {
  const bruto = (cdi * pctCDI) / 100;
  const ir = isento ? 0 : aliquotaIR(meses * 30);
  return bruto * (1 - ir / 100);
}

/** Poupança: com Selic acima de 8,5%, rende 0,5% ao mês + TR (TR ignorada aqui, costuma ser baixa). */
export const poupancaAnual = (selic: number) => (selic > 8.5 ? (Math.pow(1.005, 12) - 1) * 100 : selic * 0.7);

/* ---------------- Recomendações por plano ---------------- */

export interface Opcao {
  nome: string;
  porque: string;
  onde: string;
  risco: 'baixo' | 'médio' | 'alto';
  liquidez: string;
}

export interface Recomendacao {
  horizonte: 'curto' | 'medio' | 'longo';
  resumo: string;
  alocacao: { classe: string; pct: number }[];
  opcoes: Opcao[];
  rendimentoAnualEstimado?: number; // % a.a. líquido, aproximado
}

const OPC = {
  tesouroSelic: {
    nome: 'Tesouro Selic',
    porque: 'Título do governo que acompanha a Selic. Quase não oscila e pode ser resgatado em 1 dia útil.',
    onde: 'Pelo site/app do Tesouro Direto, usando qualquer banco ou corretora habilitada.',
    risco: 'baixo',
    liquidez: 'D+1',
  },
  cdbLiquidez: {
    nome: 'CDB com liquidez diária (100% do CDI ou mais)',
    porque: 'Rende parecido com o Tesouro Selic e o dinheiro fica disponível quando precisar.',
    onde: 'Bancos digitais e corretoras. Confira se o banco é coberto pelo FGC (até R$ 250 mil por CPF por instituição).',
    risco: 'baixo',
    liquidez: 'Diária',
  },
  cofrinho: {
    nome: 'Cofrinho / caixinha do seu banco',
    porque: 'Prático para separar o dinheiro de cada plano. Funciona bem se render 100% do CDI.',
    onde: 'No app do seu banco. Confira quanto rende: alguns pagam menos de 100% do CDI.',
    risco: 'baixo',
    liquidez: 'Diária',
  },
  lci: {
    nome: 'LCI / LCA com vencimento antes do seu prazo',
    porque: 'Isenta de Imposto de Renda. 90% do CDI isento costuma empatar com um CDB de 105–110%.',
    onde: 'Bancos e corretoras. Também tem cobertura do FGC. Atenção à carência mínima.',
    risco: 'baixo',
    liquidez: 'No vencimento',
  },
  ipca: {
    nome: 'Tesouro IPCA+',
    porque: 'Protege da inflação com um ganho real garantido se levado até o vencimento.',
    onde: 'Tesouro Direto. Escolha um vencimento próximo da data do plano; vender antes pode ter perda.',
    risco: 'médio',
    liquidez: 'Melhor levar ao vencimento',
  },
  prefixado: {
    nome: 'Tesouro Prefixado ou CDB prefixado',
    porque: 'Você já sabe quanto vai ter no vencimento. Bom quando os juros estão altos.',
    onde: 'Tesouro Direto, bancos e corretoras. Vencimento perto da data do plano.',
    risco: 'médio',
    liquidez: 'Melhor levar ao vencimento',
  },
  etf: {
    nome: 'ETFs de ações (Brasil e exterior)',
    porque: 'Diversifica em dezenas de empresas com custo baixo. Oscila bastante, só para prazos longos.',
    onde: 'Corretora com conta na B3. Aportes mensais pequenos e constantes.',
    risco: 'alto',
    liquidez: 'D+2, com oscilação',
  },
  cripto: {
    nome: 'Bitcoin (pequena parte)',
    porque: 'Pode valorizar muito, mas já caiu mais de 50% várias vezes. Nunca para dinheiro com data marcada.',
    onde: 'ETF de bitcoin na B3 pela sua corretora (sem precisar de carteira cripto) ou corretora de cripto regulada.',
    risco: 'alto',
    liquidez: 'Diária, com oscilação forte',
  },
} satisfies Record<string, Opcao>;

export function recomendar(meses: number, perfil: PerfilRisco = 'conservador', cdi?: number): Recomendacao {
  let r: Recomendacao;
  if (!Number.isFinite(meses) || meses <= 24) {
    r = {
      horizonte: 'curto',
      resumo: 'Prazo de até 2 anos: o dinheiro precisa estar lá na data certa. Só renda fixa com liquidez, sem ações nem cripto.',
      alocacao: [{ classe: 'Renda fixa pós-fixada com liquidez', pct: 100 }],
      opcoes: [OPC.tesouroSelic, OPC.cdbLiquidez, OPC.cofrinho, OPC.lci],
    };
    if (cdi) r.rendimentoAnualEstimado = liquidoAnual(cdi, 100, Math.max(meses, 1));
  } else if (meses <= 60) {
    const aloc =
      perfil === 'conservador'
        ? [{ classe: 'Pós-fixado (Tesouro Selic / CDB)', pct: 70 }, { classe: 'Tesouro IPCA+ ou prefixado', pct: 30 }]
        : perfil === 'moderado'
          ? [{ classe: 'Pós-fixado (Tesouro Selic / CDB)', pct: 60 }, { classe: 'Tesouro IPCA+ ou prefixado', pct: 30 }, { classe: 'ETFs de ações', pct: 10 }]
          : [{ classe: 'Pós-fixado (Tesouro Selic / CDB)', pct: 50 }, { classe: 'Tesouro IPCA+ ou prefixado', pct: 30 }, { classe: 'ETFs de ações', pct: 15 }, { classe: 'Bitcoin', pct: 5 }];
    r = {
      horizonte: 'medio',
      resumo: 'Prazo de 2 a 5 anos: base em renda fixa, com uma parte que protege da inflação. Renda variável só em pequena dose.',
      alocacao: aloc,
      opcoes: [OPC.tesouroSelic, OPC.cdbLiquidez, OPC.lci, OPC.ipca, OPC.prefixado, ...(perfil !== 'conservador' ? [OPC.etf] : []), ...(perfil === 'arrojado' ? [OPC.cripto] : [])],
    };
    if (cdi) r.rendimentoAnualEstimado = liquidoAnual(cdi, 100, meses);
  } else {
    const aloc =
      perfil === 'conservador'
        ? [{ classe: 'Tesouro IPCA+', pct: 50 }, { classe: 'Pós-fixado (Tesouro Selic / CDB)', pct: 50 }]
        : perfil === 'moderado'
          ? [{ classe: 'Tesouro IPCA+', pct: 40 }, { classe: 'Pós-fixado (Tesouro Selic / CDB)', pct: 30 }, { classe: 'ETFs de ações', pct: 25 }, { classe: 'Bitcoin', pct: 5 }]
          : [{ classe: 'Tesouro IPCA+', pct: 30 }, { classe: 'Pós-fixado (Tesouro Selic / CDB)', pct: 20 }, { classe: 'ETFs de ações', pct: 40 }, { classe: 'Bitcoin', pct: 10 }];
    r = {
      horizonte: 'longo',
      resumo: 'Prazo acima de 5 anos: dá para buscar mais retorno, porque há tempo para atravessar as quedas.',
      alocacao: aloc,
      opcoes: [OPC.ipca, OPC.tesouroSelic, OPC.cdbLiquidez, ...(perfil !== 'conservador' ? [OPC.etf, OPC.cripto] : [])],
    };
    if (cdi) r.rendimentoAnualEstimado = liquidoAnual(cdi, 100, meses);
  }
  return r;
}

/** Reserva de emergência recomendada: 6 meses do custo de vida, em aplicação com liquidez diária. */
export const reservaEmergencia = (gastoMensal: number, meses = 6) => gastoMensal * meses;

/** Rendimento mensal esperado (decimal) para projeções, a partir do % ao ano. */
export const rendimentoMensal = (anualPct?: number) => (anualPct ? taxaMensal(anualPct) : 0);

/** Regra 50/30/20: até 50% necessidades, 30% desejos, 20% para planos e investimentos. */
export const metaPoupanca = (renda: number) => renda * 0.2;
