import type { Movimento } from '../db';
import { categorizar } from './categorias';
import { lerValor } from './format';
import { chaveMovimento } from './importar';
import { extrairLocal } from './lugar';
import { formaDoTexto } from './cartao';

/**
 * Lê o TEXTO de uma notificação (de qualquer banco ou app de pagamento) e tenta
 * extrair um gasto ou um dinheiro recebido. Notificações que não falam de dinheiro
 * retornam null e são descartadas na hora: nada é guardado.
 */
const VALOR = /R\$\s?-?\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:,\d{2})?)/i;

const ENTRADA = [
  /recebeu/i, /recebido/i, /recebimento/i, /dep[oó]sito/i, /cr[eé]dito em conta/i, /caiu na (sua )?conta/i,
  /transfer[eê]ncia recebida/i, /estorno/i, /reembolso/i, /sal[aá]rio/i,
];
const SAIDA = [
  /compra/i, /pagamento/i, /pago/i, /paga/i, /enviad[oa]/i, /d[eé]bito/i, /transfer[eê]ncia (realizada|enviada)/i,
  /saque/i, /aprovad[ao]/i, /voc[eê] (pagou|transferiu|enviou)/i, /pix (enviado|realizado)/i, /fatura/i,
];
const IGNORAR = [
  /c[oó]digo de (verifica|seguran)/i, /token/i, /senha/i, /oferta/i, /promo/i, /cashback dispon/i,
  // Lembretes da fatura não são gastos (as compras já entram uma a uma).
  /fatura (fechou|fechada|vence|venceu|est[aá] (dispon|fechada|aberta)|dispon[ií]vel|do m[eê]s)/i, /vence (hoje|amanh)/i,
];

/** Texto sem acentos e em minúsculas (avisos às vezes vêm com acentos "separados" ou em maiúsculas). */
export const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/*
 * Cotações e mercado (ex.: "USD/BRL — compra R$ 5,43 · venda R$ 5,44", "Dólar hoje: R$ 5,80",
 * "Ibovespa fecha em alta de 1,2%"). Não são pagamentos, mesmo vindo do app do banco.
 * Uma compra de verdade em moeda estrangeira ("Compra aprovada de US$ 20 no cartão final 1234")
 * continua sendo lida, porque confirma o pagamento.
 * A MESMA regra está em android/.../LeitorPagamentos.java.
 */
const MOEDA = /(?:^|[^a-z0-9])(dolar(es)?|usd|us\$|u\$|euro(s)?|eur|€|libra(s)? esterlina|gbp|iene|jpy|peso(s)? argentino|bitcoin|btc|ethereum|eth|cripto(moeda)?s?|ptax|moeda(s)? estrangeira)(?=$|[^a-z0-9])/;
const MERCADO = /(cotac(ao|oes)|cambio|ibovespa|bolsa de valores|na bolsa|a bolsa|mercado financeiro|fechou (em|a)\b|fecha (em|a)\b|fechamento do|abertura do|em (alta|queda)\b|(alta|queda|variacao|valorizacao|desvalorizacao) de \d|(subiu|caiu|recuou|avancou|valorizou|desvalorizou|disparou|despencou) (para|a|\d)|\d+([.,]\d+)?\s?%\s(de )?(alta|queda))/;
const CONFIRMA_PAGAMENTO = /(aprovad|recusad|no cartao|cartao (final|de credito|de debito|virtual|terminado)|final \d{3,4}|voce (pagou|comprou|enviou|transferiu|recebeu)|pix (enviado|realizado|recebido|agendado)|pagamento (realizado|efetuado|aprovado|confirmado|de boleto)|compra (realizada|aprovada|no (debito|credito))|transferencia (realizada|enviada|recebida)|debitad|creditad|saque (realizado|efetuado))/;
// "compra 5,43 … venda 5,44": preço de compra E de venda, cada um seguido de um número.
const COMPRA_NUM = /\bcompra\b[^\d\n]{0,12}\d/;
const VENDA_NUM = /\bvenda\b[^\d\n]{0,12}\d/;

export function ehCotacaoOuMercado(texto: string) {
  const t = semAcento(texto);
  const moeda = MOEDA.test(t);
  const confirma = CONFIRMA_PAGAMENTO.test(t);
  if (COMPRA_NUM.test(t) && VENDA_NUM.test(t) && (moeda || !confirma)) return true;
  return (moeda || MERCADO.test(t)) && !confirma;
}

/** Aviso só sobre o limite (ex.: "seu limite disponível aumentou"). "Compra aprovada… limite disponível R$ X" é compra. */
const SO_LIMITE = (t: string) => /limite (dispon[ií]vel|do cart[aã]o)/i.test(t) && !/compra|aprovad|pagamento|pago|d[eé]bito|pix/i.test(t);

/** Avisos que nunca são pagamento (códigos, ofertas, cotação do dólar etc.). */
export const avisoIgnoravel = (texto: string) => SO_LIMITE(texto) || IGNORAR.some((r) => r.test(texto)) || ehCotacaoOuMercado(texto);

/**
 * "Modelo" do aviso: o texto sem números (e sem acentos), resumido num código curto.
 * Avisos repetidos do mesmo tipo (ex.: a cotação de todo dia) têm o mesmo modelo, mesmo com valores
 * diferentes. Quando a pessoa diz "não era um gasto", o modelo vai para a lista de ignorados.
 * Só o código é guardado, nunca o texto. A MESMA conta está em ServicoNotificacoes.java.
 */
export function textoDoModelo(titulo: string, texto: string) {
  return semAcento(`${titulo ?? ''} ${texto ?? ''}`)
    .replace(/\d[\d.,:/]*/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}
export async function modeloDoAviso(titulo: string, texto: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(textoDoModelo(titulo, texto)));
  return [...new Uint8Array(h)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function lerNotificacao(app: string, titulo: string, texto: string, quando = new Date()): Omit<Movimento, 'id'> | null {
  const completo = `${titulo} ${texto}`.trim();
  if (avisoIgnoravel(completo)) return null;
  const m = completo.match(VALOR);
  if (!m) return null;
  const valor = lerValor(m[1]);
  if (!valor) return null;

  const ehEntrada = ENTRADA.some((r) => r.test(completo));
  const ehSaida = SAIDA.some((r) => r.test(completo));
  if (!ehEntrada && !ehSaida) return null;
  const tipo = ehEntrada && !/voc[eê] (pagou|transferiu|enviou)/i.test(completo) ? 'entrada' : 'saida';

  // Nome do lugar. Se não der para descobrir, fica pendente e o app pergunta na hora.
  const local = extrairLocal(completo, tipo);
  const descricao = local ?? (tipo === 'entrada' ? 'Entrada' : 'Gasto');
  const data = quando.toISOString();
  // Débito ou crédito? Se o aviso não disser, o app pergunta (e em quantas vezes).
  const forma = tipo === 'saida' ? formaDoTexto(completo) : {};
  return {
    ...(tipo === 'saida' ? { forma: forma.forma, parcelas: forma.parcelas, formaPendente: !forma.forma } : {}),
    data,
    valor,
    tipo,
    descricao,
    local,
    localPendente: !local,
    avisadoPor: app,
    categoria: categorizar(`${local ?? ''} ${completo}`, tipo),
    origem: 'notificacao',
    chave: chaveMovimento(data, valor, `${descricao}|${quando.getTime()}`, tipo),
  };
}
