import type { Compra, Importancia, Movimento, Perfil } from '../db';
import { estadoCartao, mesDaFatura, parcelaNaFatura } from './cartao';
import { chaveMes, mesesEntre, reaisCurto } from './format';
import { parcelaPrice } from './finance';

/**
 * Conselheiro de compras: diz se vale comprar agora, à vista ou em quantas parcelas,
 * sem estourar o orçamento, o limite do cartão nem atrasar demais os planos.
 *
 * Regras (conservadoras, para não criar dívida):
 * - Todas as parcelas somadas: no máximo 30% do valor livre do mês (o que sobra depois dos gastos)
 *   e nunca acima de 15% da renda mensal.
 * - Sem juros: escolhe o MENOR número de parcelas que cabe nesse espaço (termina a dívida antes).
 * - Com juros: só quando é necessidade e não há opção sem juros; mostra quanto custa a mais.
 * - Desejo caro (mais da metade do valor livre, ou que não cabe): recomenda adiar e juntar antes.
 * - Cartão: nunca passar do limite disponível; alerta acima de 80% de uso.
 */

export interface Contexto {
  renda: number;
  livre: number;
  /** Parcelas de compras já assumidas, por mês. */
  compromissoMensal: number;
  limiteDisponivel?: number;
  limiteTotal?: number;
  /** Soma do que vai para os planos por mês (para estimar o atraso). */
  aportePlanos: number;
  /** Fatura do cartão em que a compra cairia (já registrada, sem esta compra). */
  faturaAtual?: number;
}

export interface Pedido {
  valor: number;
  importancia: Importancia;
  /** Até quantas vezes a loja parcela SEM juros (1 = só à vista). */
  maxSemJuros: number;
  /** Opção com juros oferecida (opcional). */
  comJuros?: { parcelas: number; jurosMes: number };
  /** Desconto à vista em % (opcional). */
  descontoAVista?: number;
  noCartao: boolean;
}

export type Decisao = 'avista' | 'sem-juros' | 'com-juros' | 'adiar' | 'nao-cabe';

export interface Recomendacao {
  decisao: Decisao;
  titulo: string;
  explicacao: string[];
  parcelas: number;
  valorParcela: number;
  juros: number;
  totalPago: number;
  /** Espaço mensal para parcelas que ainda resta, antes desta compra. */
  espacoMensal: number;
  alertas: string[];
  /** Para adiar: quantos meses juntando o espaço mensal. */
  mesesParaJuntar?: number;
  /** Quantos meses os planos atrasam, aproximadamente. */
  atrasoPlanos: number;
}

const r$ = (v: number) => reaisCurto(v);

/** Parcelas que caem num mês (AAAA-MM). */
export function parcelasNoMes(compras: Compra[], mes = chaveMes(new Date())) {
  return compras.filter((c) => {
    const k = mesesEntre(c.inicio, mes);
    return k >= 0 && k < c.parcelas;
  });
}

export function compromissoDoMes(compras: Compra[], mes = chaveMes(new Date())) {
  return parcelasNoMes(compras, mes).reduce((a, c) => a + c.valorParcela, 0);
}

/** Quanto ainda falta pagar (parcelas futuras, incluindo a deste mês). */
export function saldoDevedor(c: Compra, mes = chaveMes(new Date())) {
  const pagas = Math.max(0, mesesEntre(c.inicio, mes));
  return Math.max(0, c.parcelas - pagas) * c.valorParcela;
}

/** Limite do cartão ainda livre: limite − usado informado − compras no cartão registradas depois disso. */
export function limiteDisponivel(limite: number | undefined, usado: number | undefined, usadoEm: string | undefined, compras: Compra[]) {
  if (!limite) return undefined;
  const depois = compras.filter((c) => c.noCartao && (!usadoEm || c.criadaEm > usadoEm)).reduce((a, c) => a + saldoDevedor(c), 0);
  return Math.max(0, limite - (usado ?? 0) - depois);
}

/** Monta o contexto do conselheiro com o cartão (limite, fatura) e as parcelas já assumidas. */
export function contextoDeCompra(d: { perfil?: Perfil; compras: Compra[]; movimentos: Movimento[]; renda: number; livre: number; aportePlanos: number }): Contexto {
  const e = estadoCartao(d.perfil, d.compras, d.movimentos);
  const mes = chaveMes(new Date());
  // Gastos no crédito parcelado que não viraram "compra": as parcelas deste mês também ocupam o orçamento.
  const parcelasAvulsas = e.itens.filter((i) => !i.chave.startsWith('c') && i.parcelas > 1).reduce((a, i) => a + parcelaNaFatura(i, mes), 0);
  return {
    renda: d.renda,
    livre: d.livre,
    compromissoMensal: compromissoDoMes(d.compras, mes) + parcelasAvulsas,
    limiteDisponivel: e.limite ? e.disponivel : undefined,
    limiteTotal: e.limite || undefined,
    aportePlanos: d.aportePlanos,
    faturaAtual: e.faturas.find((f) => f.mes === e.aberta)?.valor ?? 0,
  };
}

export function recomendar(p: Pedido, ctx: Contexto): Recomendacao {
  const r = recomendarBase(p, ctx);
  if (!p.noCartao || ctx.faturaAtual === undefined || r.decisao === 'adiar') return r;
  // Olha a fatura: a 1ª parcela entra nela. Se a fatura passar da renda, não dá para pagar sem dívida.
  const nova = ctx.faturaAtual + r.valorParcela;
  if (ctx.renda > 0 && nova > ctx.renda) {
    const mensal = Math.max(r.espacoMensal, ctx.livre * 0.2, 1);
    const meses = Math.ceil(p.valor / mensal);
    return {
      ...r,
      decisao: 'nao-cabe',
      titulo: 'Não dá para comprar agora no cartão',
      explicacao: [
        `Sua fatura já está em ${r$(ctx.faturaAtual)}. Com esta compra iria para ${r$(nova)}, mais do que a sua renda do mês (${r$(ctx.renda)}).`,
        'Pagar só parte da fatura gera juros altos (rotativo) e pode sujar o seu nome.',
        `Juntando ${r$(mensal)}/mês, dá para comprar à vista em ${meses} ${meses === 1 ? 'mês' : 'meses'}.`,
      ],
      mesesParaJuntar: meses,
    };
  }
  if (ctx.renda > 0 && nova > ctx.renda * 0.3)
    r.alertas.push(`A fatura do cartão ficaria em ${r$(nova)} (${Math.round((nova / ctx.renda) * 100)}% da sua renda). O recomendado é até 30%: evite outras compras no crédito até ela baixar.`);
  else r.alertas.push(`A fatura do cartão ficaria em ${r$(nova)}, dentro do recomendado (até 30% da renda).`);
  return r;
}

function recomendarBase(p: Pedido, ctx: Contexto): Recomendacao {
  const espacoMensal = Math.max(0, Math.min(ctx.livre * 0.3, ctx.renda * 0.15) - ctx.compromissoMensal);
  const alertas: string[] = [];
  const atraso = (total: number) => (ctx.aportePlanos > 0 ? Math.ceil(total / ctx.aportePlanos) : 0);
  const base = { espacoMensal, alertas, juros: 0 };

  if (ctx.compromissoMensal > 0)
    alertas.push(`Você já paga ${r$(ctx.compromissoMensal)}/mês em parcelas de outras compras.`);

  const valorAVista = p.valor * (1 - (p.descontoAVista ?? 0) / 100);
  if (p.noCartao && ctx.limiteDisponivel !== undefined) {
    if (p.valor > ctx.limiteDisponivel)
      alertas.push(`Passa do limite disponível do cartão (${r$(ctx.limiteDisponivel)}). Não use o cartão: a compra pode ser recusada ou gerar juros e atraso na fatura.`);
    else if (ctx.limiteTotal && (ctx.limiteTotal - ctx.limiteDisponivel + p.valor) / ctx.limiteTotal > 0.8)
      alertas.push('Depois desta compra, mais de 80% do limite do cartão fica comprometido. Cuidado com novas compras até a fatura baixar.');
  }

  // 1) Desejo que pesa demais: adiar e juntar antes.
  const pesado = valorAVista > ctx.livre * 0.5;
  const semJurosCabe = (n: number) => p.valor / n <= espacoMensal + 0.01;
  const melhorSemJuros = Array.from({ length: Math.max(1, p.maxSemJuros) }, (_, i) => i + 1).find(semJurosCabe);
  if (p.importancia === 'desejo' && (pesado || melhorSemJuros === undefined)) {
    const mensal = Math.max(espacoMensal, ctx.livre * 0.2, 1);
    const meses = Math.ceil(valorAVista / mensal);
    return {
      ...base,
      decisao: 'adiar',
      titulo: 'Recomendo não comprar agora',
      explicacao: [
        `É um desejo e custa ${r$(valorAVista)}, ${pesado ? 'mais da metade do que sobra no seu mês' : 'e as parcelas não cabem no seu orçamento'}.`,
        `Juntando ${r$(mensal)}/mês, você compra à vista em ${meses} ${meses === 1 ? 'mês' : 'meses'}, sem dívida e sem juros.`,
      ],
      parcelas: 1,
      valorParcela: valorAVista,
      totalPago: valorAVista,
      mesesParaJuntar: meses,
      atrasoPlanos: atraso(valorAVista),
    };
  }

  // 2) À vista, se cabe com folga no mês (ou há desconto bom).
  const cabeAVista = valorAVista <= ctx.livre * 0.3 || ((p.descontoAVista ?? 0) >= 5 && valorAVista <= ctx.livre * 0.6);
  if (cabeAVista && (p.maxSemJuros <= 1 || (p.descontoAVista ?? 0) >= 3 || valorAVista <= espacoMensal)) {
    return {
      ...base,
      decisao: 'avista',
      titulo: (p.descontoAVista ?? 0) > 0 ? `Pague à vista com ${p.descontoAVista}% de desconto` : 'Pague à vista',
      explicacao: [`Cabe no seu mês sem apertar: ${r$(valorAVista)} de ${r$(ctx.livre)} livres.`, 'Sem parcela, seu orçamento dos próximos meses fica livre.'],
      parcelas: 1,
      valorParcela: valorAVista,
      totalPago: valorAVista,
      atrasoPlanos: atraso(valorAVista),
    };
  }

  // 3) Sem juros, menor número de parcelas que cabe.
  if (melhorSemJuros !== undefined && p.maxSemJuros > 1) {
    const n = Math.max(2, melhorSemJuros);
    return {
      ...base,
      decisao: 'sem-juros',
      titulo: `Parcele em ${n}x sem juros`,
      explicacao: [
        `${n}x de ${r$(p.valor / n)} cabem no espaço que você tem para parcelas (${r$(espacoMensal)}/mês).`,
        n < p.maxSemJuros ? `Dá para dividir em até ${p.maxSemJuros}x, mas ${n}x termina antes e deixa o orçamento livre mais cedo.` : 'É o número de parcelas que a loja oferece.',
      ],
      parcelas: n,
      valorParcela: p.valor / n,
      totalPago: p.valor,
      atrasoPlanos: atraso(p.valor),
    };
  }

  // 4) Com juros: só para necessidade.
  if (p.comJuros && p.importancia !== 'desejo') {
    const parcela = parcelaPrice(p.valor, p.comJuros.jurosMes / 100, p.comJuros.parcelas);
    const total = parcela * p.comJuros.parcelas;
    if (parcela <= espacoMensal + 0.01) {
      alertas.push(`Com juros você paga ${r$(total - p.valor)} a mais. Se puder esperar ou achar sem juros, economiza esse valor.`);
      return {
        ...base,
        decisao: 'com-juros',
        titulo: `Se for mesmo necessário: ${p.comJuros.parcelas}x com juros`,
        explicacao: [`${p.comJuros.parcelas}x de ${r$(parcela)} cabem no seu mês.`, `Total pago: ${r$(total)} (${r$(total - p.valor)} de juros).`],
        parcelas: p.comJuros.parcelas,
        valorParcela: parcela,
        juros: p.comJuros.jurosMes,
        totalPago: total,
        atrasoPlanos: atraso(total),
      };
    }
  }

  // 5) Não cabe.
  const mensal = Math.max(espacoMensal, ctx.livre * 0.2, 1);
  const meses = Math.ceil(valorAVista / mensal);
  return {
    ...base,
    decisao: 'nao-cabe',
    titulo: p.importancia === 'necessidade' ? 'Procure uma opção mais barata ou mais parcelas sem juros' : 'Recomendo não comprar agora',
    explicacao: [
      espacoMensal <= 0
        ? 'Suas parcelas atuais já ocupam todo o espaço seguro do mês.'
        : `Nenhuma forma de pagamento oferecida cabe no espaço seguro para parcelas (${r$(espacoMensal)}/mês).`,
      `Juntando ${r$(mensal)}/mês, dá para comprar à vista em ${meses} ${meses === 1 ? 'mês' : 'meses'}.`,
    ],
    parcelas: Math.max(1, p.maxSemJuros),
    valorParcela: p.valor / Math.max(1, p.maxSemJuros),
    totalPago: p.valor,
    mesesParaJuntar: meses,
    atrasoPlanos: atraso(p.valor),
  };
}

/** Mês da primeira parcela: a fatura onde a compra cai (cartão), este mês para os outros. */
export const inicioParcelas = (noCartao: boolean, hoje = new Date(), perfil?: Pick<Perfil, 'cartaoFechamento' | 'cartaoVencimento'>) =>
  noCartao ? mesDaFatura(hoje, perfil?.cartaoFechamento, perfil?.cartaoVencimento) : chaveMes(hoje);
