import type { Movimento } from '../db';
import { categorizar } from './categorias';
import { lerValor } from './format';
import { chaveMovimento } from './importar';

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
const IGNORAR = [/limite dispon[ií]vel/i, /c[oó]digo de (verifica|seguran)/i, /token/i, /senha/i, /oferta/i, /promo/i, /cashback dispon/i];

export function lerNotificacao(app: string, titulo: string, texto: string, quando = new Date()): Omit<Movimento, 'id'> | null {
  const completo = `${titulo} ${texto}`.trim();
  if (IGNORAR.some((r) => r.test(completo))) return null;
  const m = completo.match(VALOR);
  if (!m) return null;
  const valor = lerValor(m[1]);
  if (!valor) return null;

  const ehEntrada = ENTRADA.some((r) => r.test(completo));
  const ehSaida = SAIDA.some((r) => r.test(completo));
  if (!ehEntrada && !ehSaida) return null;
  const tipo = ehEntrada && !/voc[eê] (pagou|transferiu|enviou)/i.test(completo) ? 'entrada' : 'saida';

  // Estabelecimento: texto depois de " em ", " para " ou " de ", até pontuação.
  const lugar =
    completo.match(/\b(?:em|no|na)\s+([A-Z0-9][\w*&.\- ]{2,40})/)?.[1] ??
    completo.match(/\b(?:para|de)\s+([A-ZÀ-Ú][\w&.\- ]{2,40})/)?.[1] ??
    app;
  const descricao = lugar.replace(/\s+(foi|no valor|R\$).*$/i, '').trim();
  const data = quando.toISOString();
  return {
    data,
    valor,
    tipo,
    descricao,
    categoria: categorizar(`${descricao} ${completo}`, tipo),
    origem: 'notificacao',
    chave: chaveMovimento(data, valor, descricao, tipo),
  };
}
