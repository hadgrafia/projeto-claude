import type { Compra, FormaPag, Movimento, Perfil } from '../db';
import { chaveMes, mesesEntre, somarMeses } from './format';

/**
 * Cartão de crédito: em que fatura cai cada compra, quanto do limite está ocupado
 * e quando a fatura está pesada demais para a renda.
 *
 * Fontes das compras no crédito:
 *  - Compras com detalhes (tabela compras, noCartao): parcelas e juros informados pela pessoa;
 *  - Gastos com forma "crédito" (aviso do banco, extrato, à mão) que não viraram uma Compra.
 * O "usado hoje" informado pela pessoa cobre o que veio antes; só o que foi registrado
 * depois dessa data entra na conta, para não contar duas vezes.
 */

export const NOMES_FORMA: Record<FormaPag, string> = {
  debito: 'Débito',
  credito: 'Crédito',
  pix: 'Pix ou transferência',
  dinheiro: 'Dinheiro',
  boleto: 'Boleto',
};

/** Tenta descobrir no texto (aviso do banco, comprovante, linha do extrato) como foi pago. */
export function formaDoTexto(texto: string): { forma?: FormaPag; parcelas?: number; parcelaAtual?: number } {
  const t = texto.toLowerCase();
  const parc = t.match(/\bparc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/);
  const vezes = t.match(/\b(?:em\s+)?(\d{1,2})\s?x\b/) ?? t.match(/\bem\s+(\d{1,2})\s+(?:vezes|parcelas)\b/);
  const parcelas = parc ? Number(parc[2]) : vezes ? Number(vezes[1]) : undefined;
  const parcelaAtual = parc ? Number(parc[1]) : undefined;
  const okParc = parcelas && parcelas >= 2 && parcelas <= 48 && (!parcelaAtual || parcelaAtual <= parcelas);
  let forma: FormaPag | undefined;
  if (/cr[eé]dito em conta|cr[eé]dito recebido/.test(t)) forma = undefined;
  else if (/pagamento (da|de) fatura|fatura paga/.test(t)) forma = 'debito';
  else if (/\bcr[eé]dito\b/.test(t)) forma = 'credito';
  else if (/\bd[eé]bito\b/.test(t)) forma = 'debito';
  else if (/\bpix\b|\bted\b|\bdoc\b|transfer[eê]ncia/.test(t)) forma = 'pix';
  else if (/\bboleto\b/.test(t)) forma = 'boleto';
  if (!forma && okParc && (vezes || /\bparc/.test(t))) forma = 'credito';
  return { forma, ...(okParc && forma === 'credito' ? { parcelas, ...(parcelaAtual ? { parcelaAtual } : {}) } : {}) };
}

/** Mês (AAAA-MM) em que VENCE a fatura onde cai uma compra feita nesta data. */
export function mesDaFatura(data: Date, fechamento?: number, vencimento?: number) {
  const mes = chaveMes(data);
  if (!fechamento) return somarMeses(mes, 1);
  const fechaEm = data.getDate() >= fechamento ? somarMeses(mes, 1) : mes;
  return vencimento && vencimento > fechamento ? fechaEm : somarMeses(fechaEm, 1);
}

/** Fatura que está aberta hoje (onde entra uma compra feita agora). */
export const faturaAberta = (perfil?: Perfil, hoje = new Date()) => mesDaFatura(hoje, perfil?.cartaoFechamento, perfil?.cartaoVencimento);

/** Primeira fatura ainda não paga: a deste mês até o dia do vencimento (sem o dia informado, o mês todo). */
export function faturaAPagar(perfil?: Perfil, hoje = new Date()) {
  const venc = perfil?.cartaoVencimento;
  return venc && hoje.getDate() > venc ? somarMeses(chaveMes(hoje), 1) : chaveMes(hoje);
}

export interface ItemCartao {
  chave: string;
  descricao: string;
  /** Valor total da compra. */
  valor: number;
  parcelas: number;
  valorParcela: number;
  /** Mês (AAAA-MM) da fatura da 1ª parcela. */
  inicio: string;
  data: string;
  /** Registrada depois do "usado hoje" informado (entra no cálculo do limite). */
  conta: boolean;
}

export function itensCartao(perfil: Perfil | undefined, compras: Compra[], movimentos: Movimento[]): ItemCartao[] {
  const usadoEm = perfil?.limiteUsadoEm;
  const ligadas = new Set(compras.map((c) => c.movimentoChave).filter(Boolean));
  const out: ItemCartao[] = compras
    .filter((c) => c.noCartao)
    .map((c) => ({
      chave: `c${c.id}`,
      descricao: c.descricao,
      valor: c.valor,
      parcelas: c.parcelas,
      valorParcela: c.valorParcela,
      inicio: c.inicio,
      data: c.criadaEm,
      conta: !usadoEm || c.criadaEm > usadoEm,
    }));
  for (const m of movimentos) {
    if (m.tipo !== 'saida' || m.forma !== 'credito' || ligadas.has(m.chave)) continue;
    const n = Math.max(1, m.parcelas ?? 1);
    const atual = m.parcelaAtual && m.parcelaAtual <= n ? m.parcelaAtual : undefined;
    const valorParcela = atual ? m.valor : m.valor / n;
    const inicio = atual && m.faturaMes ? somarMeses(m.faturaMes, -(atual - 1)) : m.faturaMes ?? mesDaFatura(new Date(m.data), perfil?.cartaoFechamento, perfil?.cartaoVencimento);
    out.push({
      chave: m.chave,
      descricao: m.local || m.descricao,
      valor: valorParcela * n,
      parcelas: n,
      valorParcela,
      inicio,
      data: m.data,
      conta: !usadoEm || m.data > usadoEm,
    });
  }
  return out.sort((a, b) => b.data.localeCompare(a.data));
}

/** Quanto deste item cai na fatura que vence no mês informado. */
export function parcelaNaFatura(i: ItemCartao, mes: string) {
  const k = mesesEntre(i.inicio, mes);
  return k >= 0 && k < i.parcelas ? i.valorParcela : 0;
}

/** Número da parcela que cai na fatura do mês (1..n), ou 0. */
export function numeroParcela(i: ItemCartao, mes: string) {
  const k = mesesEntre(i.inicio, mes);
  return k >= 0 && k < i.parcelas ? k + 1 : 0;
}

/** Ainda a pagar deste item, considerando pagas as faturas antes de `desde`. */
export function aPagar(i: ItemCartao, desde: string) {
  const pagas = Math.max(0, mesesEntre(i.inicio, desde));
  return Math.max(0, i.parcelas - pagas) * i.valorParcela;
}

export interface EstadoCartao {
  limite: number;
  usado: number;
  disponivel: number;
  /** 0..1 */
  uso: number;
  aberta: string;
  /** Faturas a partir da primeira ainda não paga (4 meses). */
  faturas: { mes: string; valor: number }[];
  itens: ItemCartao[];
  /** Parcelas que ainda vão cair (compras parceladas ativas). */
  parceladas: ItemCartao[];
}

export function estadoCartao(perfil: Perfil | undefined, compras: Compra[], movimentos: Movimento[], hoje = new Date()): EstadoCartao {
  const itens = itensCartao(perfil, compras, movimentos);
  const aberta = faturaAberta(perfil, hoje);
  const primeira = faturaAPagar(perfil, hoje);
  const limite = perfil?.limiteCartao ?? 0;
  const registrado = itens.filter((i) => i.conta).reduce((a, i) => a + aPagar(i, primeira), 0);
  const usado = Math.min(limite || Infinity, (perfil?.limiteUsado ?? 0) + registrado);
  const disponivel = Math.max(0, limite - usado);
  const faturas = Array.from({ length: 4 }, (_, k) => {
    const mes = somarMeses(primeira, k);
    return { mes, valor: itens.reduce((a, i) => a + parcelaNaFatura(i, mes), 0) };
  });
  const parceladas = itens.filter((i) => i.parcelas > 1 && aPagar(i, primeira) > 0);
  return { limite, usado: Number.isFinite(usado) ? usado : 0, disponivel, uso: limite ? usado / limite : 0, aberta, faturas, itens, parceladas };
}

export interface AlertasCartao {
  /** Limite maior que a renda do mês: alerta vermelho na página do cartão. */
  limiteAcimaDaRenda: boolean;
  /** Limite maior até que a renda somada a tudo o que está investido. */
  limiteAcimaDeTudo: boolean;
  /** Teto recomendado para a fatura: 30% da renda (o resto paga a vida e os planos). */
  usoSeguroMes: number;
  /** Fatura mais pesada (a que vence agora ou a aberta). */
  fatura: number;
  /** Fatura acima do teto recomendado. */
  faturaAlta: boolean;
  /** Parte da fatura que passa da renda: só daria para pagar tirando dos investimentos. */
  tirariaDosInvestimentos: number;
  /** A fatura passa da renda + investimentos: risco de atraso, juros e nome sujo. */
  semCobertura: boolean;
}

export function alertasCartao(e: EstadoCartao, renda: number, investido: number): AlertasCartao {
  const fatura = Math.max(e.faturas[0]?.valor ?? 0, e.faturas.find((f) => f.mes === e.aberta)?.valor ?? 0);
  const usoSeguroMes = Math.max(0, renda * 0.3);
  const tirariaDosInvestimentos = Math.max(0, fatura - renda);
  return {
    limiteAcimaDaRenda: e.limite > 0 && e.limite > renda,
    limiteAcimaDeTudo: e.limite > 0 && e.limite > renda + investido,
    usoSeguroMes,
    fatura,
    faturaAlta: fatura > 0 && fatura > usoSeguroMes,
    tirariaDosInvestimentos,
    semCobertura: tirariaDosInvestimentos > investido,
  };
}

/**
 * Quanto dá para gastar no cartão por mês sem atrasar os planos.
 *
 * Conta: renda − gastos fora do cartão (débito, Pix, dinheiro, boleto) − o que o plano precisa por mês.
 * Os gastos fora do cartão vêm da média dos últimos 3 meses completos com registros
 * (o mesmo período do "gasto típico"), descontando o que foi no crédito.
 */
export interface PlanoParaTeto {
  id: number;
  nome: string;
  /** Mês desejado (AAAA-MM), se a pessoa definiu. */
  prazo?: string;
  /** Quanto a pessoa precisa guardar por mês: para chegar no prazo, ou o que já separa hoje (sem prazo). */
  precisaPorMes: number;
}

export interface TetoCartao {
  renda: number;
  gastoTipico: number;
  /** Média por mês gasta no crédito nos mesmos meses. */
  cartaoTipico: number;
  foraDoCartao: number;
  porPlano: (PlanoParaTeto & { teto: number })[];
  /** Todos os planos juntos. */
  todos: { precisa: number; teto: number };
}

export function tetoCartaoPorPlanos(renda: number, gastoTipico: number, movimentos: Movimento[], planos: PlanoParaTeto[], hoje = new Date()): TetoCartao {
  const atual = chaveMes(hoje);
  const total = new Map<string, number>();
  const credito = new Map<string, number>();
  for (const m of movimentos) {
    if (m.tipo !== 'saida') continue;
    const k = m.data.slice(0, 7);
    total.set(k, (total.get(k) ?? 0) + m.valor);
    if (m.forma === 'credito') credito.set(k, (credito.get(k) ?? 0) + m.valor);
  }
  const meses = [1, 2, 3].map((i) => somarMeses(atual, -i)).filter((k) => (total.get(k) ?? 0) > 0);
  const cartaoTipico = meses.length ? meses.reduce((a, k) => a + (credito.get(k) ?? 0), 0) / meses.length : 0;
  const foraDoCartao = Math.max(0, gastoTipico - cartaoTipico);
  const base = renda - foraDoCartao;
  const precisa = planos.reduce((a, p) => a + p.precisaPorMes, 0);
  return {
    renda,
    gastoTipico,
    cartaoTipico,
    foraDoCartao,
    porPlano: planos.map((p) => ({ ...p, teto: base - p.precisaPorMes })),
    todos: { precisa, teto: base - precisa },
  };
}
