import type { Compra, Investimento, Movimento, Perfil, Plano } from '../db';
import { NOMES_CATEGORIAS } from './categorias';
import { compromissoDoMes } from './compras';
import { alertasCartao, estadoCartao, NOMES_FORMA, tetoCartaoPorPlanos } from './cartao';
import { analisarMes } from './feedback';
import { chaveMes, mesLongo, reais } from './format';
import { cdiDaSelic, recomendar as recomendarInvest } from './invest';
import { proximaCobranca, totalMensal } from './assinaturas';

/** A equipe de agentes. Cada um assina as próprias respostas. */
export type IdAgente = 'nina' | 'gabriela' | 'matheus' | 'leo' | 'lari' | 'gui';
export const AGENTES: Record<IdAgente, { nome: string; papel: string; cor: string; exemplo: string; faz: string }> = {
  nina: { nome: 'Nina', papel: 'Gastos e renda', cor: '#B4552D', exemplo: 'Gastei 25 no sorvete da Borelli', faz: 'Registra gastos por texto, áudio, foto ou PDF, faz o resumo do mês, a planilha e o Imposto de Renda.' },
  gabriela: { nome: 'Gabriela', papel: 'Planos e metas', cor: '#3B4A3A', exemplo: 'Quero juntar para a casa nova em 2028', faz: 'Cria planos, diz quanto separar por mês e quando você chega lá.' },
  matheus: { nome: 'Matheus', papel: 'Investimentos', cor: '#5F7A5A', exemplo: 'Onde guardo o dinheiro da Casa Nova?', faz: 'Explica Selic, CDB, Tesouro e mostra onde guardar o dinheiro de cada plano.' },
  leo: { nome: 'Leo', papel: 'Compras e cartão', cor: '#8F4A2B', exemplo: 'Como está a fatura do meu cartão?', faz: 'Diz se vale comprar agora, olha a fatura e o limite e avisa antes de virar dívida.' },
  lari: { nome: 'Lari', papel: 'Assinaturas', cor: '#C08A3E', exemplo: 'Quanto gasto com assinaturas?', faz: 'Lembra das cobranças, soma o que você paga e mostra o que dá para cancelar.' },
  gui: { nome: 'Gui', papel: 'Guia dos planos', cor: '#2F5D62', exemplo: 'Vale a pena ir para Gramado em julho?', faz: 'Pesquisa em fontes confiáveis: melhor época, hospedagem, passeios, comida, quando comprar e cuidados.' },
};

export interface Situacao {
  guardado: number;
  aporte: number;
  pct: number;
  previsao?: string;
  meses: number;
  prazoMeses?: number;
  /** Quanto falta guardar por mês, só da pessoa, para chegar no prazo (sem prazo: o que já separa). */
  minhaParteMes?: number;
}

/**
 * Resumo dos números da pessoa que vai junto com a mensagem para a IA responder com base real.
 * Nunca inclui senha, banco, conta ou o texto das notificações.
 */
export function montarContexto(d: {
  perfil?: Perfil;
  planos: Plano[];
  movimentos: Movimento[];
  investimentos: Investimento[];
  compras: Compra[];
  renda: number;
  gasto: number;
  livre: number;
  selic?: number;
  situacoes: Map<number, Situacao>;
}) {
  const hoje = new Date();
  const mes = chaveMes(hoje);
  const porMes = new Map<string, { saidas: number; entradas: number; categorias: Record<string, number> }>();
  for (const m of d.movimentos) {
    const k = m.data.slice(0, 7);
    const r = porMes.get(k) ?? { saidas: 0, entradas: 0, categorias: {} };
    if (m.tipo === 'saida') {
      r.saidas += m.valor;
      r.categorias[m.categoria] = Math.round(((r.categorias[m.categoria] ?? 0) + m.valor) * 100) / 100;
    } else r.entradas += m.valor;
    porMes.set(k, r);
  }
  const meses = [...porMes.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  const cdi = d.selic ? cdiDaSelic(d.selic) : undefined;
  return {
    hoje: hoje.toISOString().slice(0, 10),
    // Sem nome, e-mail ou qualquer dado que identifique a pessoa: a IA recebe só os números.
    rendaMensal: Math.round(d.renda),
    gastoMensalTipico: Math.round(d.gasto),
    livrePorMesParaPlanos: Math.round(d.livre),
    perfilInvestidor: d.perfil?.perfilRisco,
    categoriasPossiveis: NOMES_CATEGORIAS,
    gastosPorMes: meses.map(([k, v]) => ({ mes: k, saidas: Math.round(v.saidas), entradas: Math.round(v.entradas), porCategoria: v.categorias })),
    ultimosLancamentos: d.movimentos.slice(0, 60).map((m) => ({ data: m.data.slice(0, 10), tipo: m.tipo, valor: m.valor, lugar: m.local ?? m.descricao, categoria: m.categoria, ...(m.forma ? { forma: NOMES_FORMA[m.forma] } : {}), ...(m.parcelas && m.parcelas > 1 ? { parcelas: m.parcelas } : {}) })),
    sugestoesDoMes: analisarMes(d.movimentos, d.renda).map((s) => ({ categoria: s.categoria, status: s.status, economiaPossivelMes: Math.round(s.ganhoMensal), explicacao: s.texto })),
    planos: d.planos.map((p) => {
      const s = d.situacoes.get(p.id!);
      return {
        nome: p.nome,
        tipo: p.tipo,
        meta: Math.round(p.meta),
        guardado: Math.round(s?.guardado ?? 0),
        porcentoDoLivre: p.percentual,
        separaPorMes: Math.round(s?.aporte ?? 0),
        prazoDesejado: p.prazo,
        // Tema do plano (para o Gui pesquisar): destino, cidade, modelo… sem valores.
        tema: temaDoPlano(p),
        previsaoReal: s?.previsao,
        ondeGuardar: recomendarInvest(s?.prazoMeses ?? s?.meses ?? 24, d.perfil?.perfilRisco, cdi).resumo,
      };
    }),
    investimentos: d.investimentos.map((i) => ({ nome: i.nome, tipo: i.tipo, saldo: Math.round(i.saldo), plano: d.planos.find((p) => p.id === i.planoId)?.nome })),
    selicAnual: d.selic,
    cdiAnual: cdi,
    cartao: resumoCartao(d),
    cartaoParaOsPlanos: tetoParaContexto(d),
    parcelasNesteMes: Math.round(compromissoDoMes(d.compras, mes)),
    comprasParceladas: d.compras.slice(-20).map((c) => ({ descricao: c.descricao, valor: c.valor, parcelas: c.parcelas, valorParcela: Math.round(c.valorParcela), inicio: c.inicio, noCartao: c.noCartao })),
    valorParaAvisoDeCompra: d.perfil?.limiteAvisoCompra ?? 100,
    assinaturas: (d.perfil?.assinaturas ?? []).map((a) => ({ nome: a.nome, valor: a.valor, ciclo: a.ciclo, diaCobranca: a.dia, mesCobranca: a.mes, proxima: proximaCobranca(a).toISOString().slice(0, 10) })),
    assinaturasPorMes: Math.round(totalMensal(d.perfil?.assinaturas ?? []) * 100) / 100,
  };
}

/** Quanto dá para gastar no cartão por mês sem atrasar cada plano (Leo e Gabriela). */
function tetoParaContexto(d: { planos: Plano[]; movimentos: Movimento[]; renda: number; gasto: number; situacoes: Map<number, Situacao> }) {
  if (!d.planos.length) return undefined;
  const t = tetoCartaoPorPlanos(
    d.renda,
    d.gasto,
    d.movimentos,
    d.planos.map((p) => ({ id: p.id!, nome: p.nome, prazo: p.prazo, precisaPorMes: d.situacoes.get(p.id!)?.minhaParteMes ?? 0 })),
  );
  const r = Math.round;
  return {
    gastosForaDoCartaoPorMes: r(t.foraDoCartao),
    gastoMedioNoCartaoPorMes: r(t.cartaoTipico),
    porPlano: t.porPlano.map((p) => ({ plano: p.nome, prazoDesejado: p.prazo, precisaGuardarPorMes: r(p.precisaPorMes), maximoNoCartaoPorMes: r(p.teto) })),
    todosOsPlanosJuntos: { precisaGuardarPorMes: r(t.todos.precisa), maximoNoCartaoPorMes: r(t.todos.teto) },
    explicacao: 'maximoNoCartaoPorMes = renda − gastos fora do cartão − o que o plano precisa por mês. Negativo: mesmo sem cartão, o prazo não fecha.',
  };
}

function temaDoPlano(p: Plano) {
  const r = p.respostas ?? {};
  const t = (k: string) => (r[k] === undefined || r[k] === null || r[k] === '' ? '' : String(r[k]).slice(0, 80));
  const partes =
    p.tipo === 'viagem'
      ? [t('destino') && `destino ${t('destino')}`, t('pessoas') && `${t('pessoas')} pessoa(s)`, t('dias') && `${t('dias')} dias`]
      : p.tipo === 'casa'
        ? [t('modalidade'), t('imovel'), t('cidade') || t('uf')]
        : p.tipo === 'carro'
          ? [t('marca'), t('modelo'), t('condicao'), t('ano')]
          : p.tipo === 'equipamentos'
            ? [String(r.itens ?? '').split('\n').map((l) => l.replace(/[\d.,]+\s*$/, '').trim()).filter(Boolean).slice(0, 5).join(', '), t('uso') && `uso: ${t('uso')}`]
            : [t('descricao')];
  return partes.filter(Boolean).join(', ') || undefined;
}

/** Cartão de crédito para o Leo: limite, fatura, parcelas e alertas, já calculados aqui no aparelho. */
function resumoCartao(d: { perfil?: Perfil; compras: Compra[]; movimentos: Movimento[]; investimentos: Investimento[]; renda: number }) {
  const e = estadoCartao(d.perfil, d.compras, d.movimentos);
  if (!e.limite && !e.itens.length) return undefined;
  const investido = d.investimentos.reduce((a, i) => a + i.saldo, 0);
  const al = alertasCartao(e, d.renda, investido);
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    limite: e.limite || undefined,
    limiteUsado: r(e.usado),
    limiteDisponivel: r(e.disponivel),
    porcentoUsado: Math.round(e.uso * 100),
    diaFechamento: d.perfil?.cartaoFechamento,
    diaVencimento: d.perfil?.cartaoVencimento,
    faturaAberta: e.aberta,
    faturas: e.faturas.map((f) => ({ venceEm: f.mes, valor: r(f.valor) })),
    tetoRecomendadoFatura: r(al.usoSeguroMes),
    faturaAlta: al.faturaAlta,
    faturaPassaDaRenda: al.tirariaDosInvestimentos > 0,
    tirariaDosInvestimentos: r(al.tirariaDosInvestimentos),
    nemInvestimentosCobrem: al.semCobertura,
    limiteMaiorQueRenda: al.limiteAcimaDaRenda,
    limiteMaiorQueRendaMaisInvestimentos: al.limiteAcimaDeTudo,
    comprasNoCredito: e.itens.slice(0, 25).map((i) => ({ descricao: i.descricao, data: i.data.slice(0, 10), total: r(i.valor), parcelas: i.parcelas, valorParcela: r(i.valorParcela), primeiraFatura: i.inicio })),
    gastosSemFormaDePagamento: d.movimentos.filter((m) => m.formaPendente).length,
  };
}

/* ---------- Ações feitas aqui no aparelho (sem IA, sem enviar nada) ---------- */

const doMes = (movs: Movimento[], mes: string) => movs.filter((m) => m.data.slice(0, 7) === mes);

/** Resumo do mês em texto (Nina). */
export function resumoDoMes(movs: Movimento[], mes: string, renda: number) {
  const lista = doMes(movs, mes);
  if (!lista.length) return `Ainda não há lançamentos em ${mesLongo(mes)}.`;
  const saidas = lista.filter((m) => m.tipo === 'saida');
  const entradas = lista.filter((m) => m.tipo === 'entrada').reduce((a, m) => a + m.valor, 0);
  const total = saidas.reduce((a, m) => a + m.valor, 0);
  const cats = new Map<string, number>();
  for (const m of saidas) cats.set(m.categoria, (cats.get(m.categoria) ?? 0) + m.valor);
  const top = [...cats].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const lugares = new Map<string, number>();
  for (const m of saidas) if (m.local) lugares.set(m.local, (lugares.get(m.local) ?? 0) + m.valor);
  const topLugar = [...lugares].sort((a, b) => b[1] - a[1])[0];
  const linhas = [
    `**${mesLongo(mes)}**: saíram ${reais(total)}${entradas ? ` e entraram ${reais(entradas)}` : ''} em ${lista.length} lançamentos.`,
    renda ? `Isso é ${Math.round((total / renda) * 100)}% da sua renda.` : '',
    top.length ? `Onde mais foi: ${top.map(([c, v]) => `${c} (${reais(v)})`).join(', ')}.` : '',
    topLugar ? `Lugar com mais gastos: ${topLugar[0]} (${reais(topLugar[1])}).` : '',
  ];
  return linhas.filter(Boolean).join('\n');
}

/** Planilha do mês (CSV que abre no Excel, Planilhas Google e Numbers). */
export function planilhaDoMes(movs: Movimento[], mes: string) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const linhas = [['Data', 'Tipo', 'Lugar', 'Categoria', 'Valor (R$)', 'Origem'].join(';')];
  for (const m of doMes(movs, mes).sort((a, b) => a.data.localeCompare(b.data))) {
    linhas.push(
      [
        new Date(m.data).toLocaleDateString('pt-BR'),
        m.tipo === 'saida' ? 'Gasto' : 'Entrada',
        esc(m.local ?? m.descricao),
        esc(m.categoria),
        (m.tipo === 'saida' ? -m.valor : m.valor).toFixed(2).replace('.', ','),
        m.origem === 'notificacao' ? 'Aviso do banco' : m.origem === 'extrato' ? 'Extrato' : 'Anotado',
      ].join(';'),
    );
  }
  // BOM para o Excel abrir os acentos certos.
  return new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

export function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Imposto de Renda (Nina): gastos que costumam ser dedutíveis no ano. */
export const CATEGORIAS_DEDUTIVEIS = ['Saúde', 'Educação'];
export function impostoDoAno(movs: Movimento[], ano: string) {
  // Farmácia (remédios) em geral não é dedutível: fica de fora.
  const lista = movs.filter((m) => m.tipo === 'saida' && m.data.startsWith(ano) && CATEGORIAS_DEDUTIVEIS.includes(m.categoria) && !/farm|drog|raia|pague menos/i.test(`${m.local ?? ''} ${m.descricao}`));
  const porCat = new Map<string, Movimento[]>();
  for (const m of lista) porCat.set(m.categoria, [...(porCat.get(m.categoria) ?? []), m]);
  if (!lista.length)
    return `Não encontrei gastos com saúde ou educação em ${ano}. Se tiver, registre com a categoria certa: consultas, exames, plano de saúde, dentista, escola e faculdade costumam ser dedutíveis.`;
  const partes = [...porCat].map(([c, l]) => {
    const total = l.reduce((a, m) => a + m.valor, 0);
    const lugares = [...new Set(l.map((m) => m.local ?? m.descricao))].slice(0, 6).join(', ');
    return `**${c}**: ${reais(total)} em ${l.length} lançamentos (${lugares}).`;
  });
  return [
    `Gastos de ${ano} que costumam entrar na declaração:`,
    ...partes,
    'Guarde os recibos e notas com o CPF ou CNPJ de quem prestou o serviço. Educação tem limite anual por pessoa; saúde não tem limite. Remédios de farmácia, em geral, não são dedutíveis. Confira as regras do ano no site da Receita Federal.',
  ].join('\n');
}

/* ---------- Conversa com a equipe ---------- */

export interface Acao {
  tipo: 'registrar' | 'avaliar_compra' | 'criar_plano' | 'relatorio' | 'resumo' | 'imposto' | 'renda' | 'guardar' | 'porcentagem' | 'investimento' | 'cartao' | 'tela' | 'assinatura';
  valor?: number | null;
  local?: string | null;
  tipoMov?: string | null;
  categoria?: string | null;
  data?: string | null;
  descricao?: string | null;
  importancia?: string | null;
  maxSemJuros?: number | null;
  noCartao?: boolean | null;
  tipoPlano?: string | null;
  nome?: string | null;
  mes?: string | null;
  ano?: string | null;
  percentual?: number | null;
  tipoInvestimento?: string | null;
  saldo?: number | null;
  aporteMensal?: number | null;
  plano?: string | null;
  limite?: number | null;
  usado?: number | null;
  fechamento?: number | null;
  vencimento?: number | null;
  forma?: string | null;
  parcelas?: number | null;
  tela?: string | null;
  ciclo?: string | null;
  dia?: number | null;
  mesCobranca?: number | null;
}
export interface RespostaAgente {
  agente: IdAgente;
  resposta: string;
  acoes: Acao[];
}

export async function perguntar(mensagem: string, historico: { de: 'pessoa' | 'agente'; texto: string }[], contexto: unknown, anexo?: { tipo: string; dados: string }): Promise<RespostaAgente> {
  if (!navigator.onLine) throw new Error('Sem internet. Os agentes precisam de conexão; o resto do app funciona normalmente.');
  const r = await fetch('/api/agente', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mensagem, historico, contexto, anexo }),
  });
  if (r.status === 401) throw new Error('Sua sessão expirou. Abra Ajustes e toque em "Entrar de novo".');
  const c = (await r.json().catch(() => ({}))) as Partial<RespostaAgente> & { erro?: string };
  if (!r.ok) throw new Error(c.erro ?? `Erro ${r.status}`);
  const agente = (Object.keys(AGENTES) as IdAgente[]).includes(c.agente as IdAgente) ? (c.agente as IdAgente) : 'nina';
  return { agente, resposta: c.resposta ?? '', acoes: Array.isArray(c.acoes) ? c.acoes : [] };
}

/** Arquivo (foto, áudio, PDF) em base64. Fotos grandes são reduzidas antes de enviar. */
export async function prepararAnexo(arquivo: Blob): Promise<{ tipo: string; dados: string; nome?: string }> {
  let blob = arquivo;
  let tipo = arquivo.type || 'application/octet-stream';
  if (tipo.startsWith('image/') && arquivo.size > 600_000) {
    const img = await createImageBitmap(arquivo);
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * escala);
    c.height = Math.round(img.height * escala);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/jpeg', 0.82));
    tipo = 'image/jpeg';
  }
  if (blob.size > 5 * 1024 * 1024) throw new Error('Arquivo grande demais (máximo 5 MB).');
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { tipo: tipo.split(';')[0], dados: btoa(bin) };
}

/**
 * Reserva local: se a IA não sugerir o registro, o app reconhece frases simples como
 * "gastei 25 no sorvete da Borelli" ou "recebi 300 da Ana" e prepara o registro (para confirmar).
 */
export function gastoDoTexto(msg: string): Acao | null {
  const m = msg.match(/\b(gastei|paguei|comprei|torrei|recebi|ganhei)\b[^\d]{0,25}?(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais|conto|pila)?\s*(.*)$/i);
  if (!m) return null;
  const valor = Number(m[2].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  if (!(valor > 0)) return null;
  const tipoMov = /recebi|ganhei/i.test(m[1]) ? 'entrada' : 'saida';
  const resto = m[3].replace(/[.!?]+$/, '').trim();
  // O lugar costuma vir depois do último "da/do/na/no/em/com".
  const partes = resto.split(/\s+(?:n[oa]s?|d[oa]s?|em|com|pr[oa]|para)\s+/i).map((p) => p.trim()).filter(Boolean);
  const bruto = (partes.length ? partes[partes.length - 1] : resto).replace(/^(?:n[oa]s?|d[oa]s?|em|com)\s+/i, '');
  const local = bruto ? bruto.charAt(0).toUpperCase() + bruto.slice(1, 60) : '';
  return { tipo: 'registrar', valor, local: local || undefined, tipoMov, categoria: null };
}

/** Encontra o plano pelo nome dito na conversa ("casa nova" → "Casa Nova"). */
export function acharPlano<T extends { nome: string }>(planos: T[], nome?: string | null) {
  if (!nome) return undefined;
  const n = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const alvo = n(nome);
  return planos.find((p) => n(p.nome) === alvo) ?? planos.find((p) => n(p.nome).includes(alvo) || alvo.includes(n(p.nome)));
}

export const TELAS: Record<string, { rota: string; nome: string }> = {
  inicio: { rota: '/inicio', nome: 'Início' },
  gastos: { rota: '/gastos', nome: 'Gastos' },
  enviar_extrato: { rota: '/importar', nome: 'Enviar extrato' },
  planos: { rota: '/planos', nome: 'Planos' },
  novo_plano: { rota: '/planos/novo', nome: 'Novo plano' },
  investir: { rota: '/investir', nome: 'Investir' },
  conselhos: { rota: '/feedback', nome: 'Conselhos' },
  antes_de_comprar: { rota: '/compra', nome: 'Antes de comprar' },
  ajustes: { rota: '/ajustes', nome: 'Ajustes' },
  assinaturas: { rota: '/assinaturas', nome: 'Assinaturas' },
  cartao: { rota: '/cartao', nome: 'Cartão' },
};
