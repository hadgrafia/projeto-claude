/**
 * Descobre o NOME DO LUGAR (loja, estabelecimento, pessoa) de um gasto ou entrada.
 * Se não der para descobrir com segurança, retorna undefined e o app pergunta à pessoa.
 *
 * A mesma lógica existe em Java no app Android (LeitorPagamentos.java), para poder
 * perguntar no mesmo instante do pagamento, mesmo com o app fechado.
 */

/** Textos que não são nome de lugar: começam com estas palavras... */
const GENERICO_INICIO = /^(?:seu|sua|seus|suas|um|uma|o seu|a sua|\d|r\$)(?:\s|$)/i;
/** ...ou são só uma destas palavras (com no máximo uma palavra a mais, ex.: "Pix enviado"). */
const GENERICO_TOTAL =
  /^(?:cart[aã]o|conta|d[eé]bito|cr[eé]dito|compra|pagamento|pix|ted|doc|transfer[eê]ncia|boleto|saque|estabelecimento|loja|valor|final|hoje|ontem|gasto|entrada)(?:\s+\S+)?$/i;

const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o']);

/** "IFOOD *IFOOD" → "Ifood"; "PG *LOJA DA ANA" → "Loja da Ana"; "MERCADOPAGO*PADARIA" → "Padaria". */
export function limparLocal(bruto: string): string {
  let s = bruto
    .replace(/\b(?:\d{2}\/\d{2}(?:\/\d{2,4})?)\b.*$/, '') // corta datas e o que vem depois
    .replace(/\b\d{1,2}:\d{2}\b.*$/, '')
    .replace(/\*{2,}\s?\d{2,4}/g, '') // ****1234
    .replace(/\b(?:final|cart[aã]o)\s*\d{3,4}\b/gi, '')
    .trim();
  // Intermediadores: o nome real fica depois do asterisco.
  const m = s.match(/^(?:pg|pag|mp|mercadopago|mercpago|pagseguro|ps|ebanx|sumup|stone|ton|picpay|ppro|paypal|ec|iz|sq)\s*\*\s*(.+)$/i);
  if (m) s = m[1];
  // "IFOOD *IFOOD" → "IFOOD"
  const partes = s.split('*').map((p) => p.trim()).filter(Boolean);
  if (partes.length > 1 && partes[0].toLowerCase().replace(/\W/g, '') === partes[1].toLowerCase().replace(/\W/g, '')) s = partes[0];
  else if (partes.length > 1) s = partes.join(' ');
  s = s.replace(/[\s.,;:\-–]+$/g, '').replace(/^[\s\-–:]+/, '').replace(/\s{2,}/g, ' ').trim();
  if (!s) return '';
  // Caixa: só ajusta quando vem tudo em MAIÚSCULAS.
  if (s === s.toUpperCase() && /[A-Z]/.test(s)) {
    s = s
      .toLowerCase()
      .split(' ')
      .map((w, i) => (i > 0 && minusculas.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ');
  }
  return s.slice(0, 60);
}

export function ehLocalValido(s: string | undefined): s is string {
  if (!s) return false;
  const t = s.trim();
  return t.length >= 2 && !GENERICO_INICIO.test(t) && !GENERICO_TOTAL.test(t) && /[a-zà-ú]/i.test(t);
}

const FIM = String.raw`(?=\s+(?:para o|no cart|com final|cart[aã]o|no dia|em \d|dia \d|[àa]s \d|foi|est[aá]|aprovad|realizad|confirmad|no valor|valor|de R\$|R\$)|[.,;!\n]|$)`;

/** Tenta extrair o lugar do texto de uma notificação. */
export function extrairLocal(texto: string, tipo: 'saida' | 'entrada'): string | undefined {
  const t = texto.replace(/\s+/g, ' ');
  const candidatos: string[] = [];
  const pega = (re: RegExp) => {
    const m = t.match(re);
    if (m?.[1]) candidatos.push(m[1]);
  };
  if (tipo === 'saida') {
    pega(new RegExp(String.raw`\b(?:em|no estabelecimento|na loja)\s+(.+?)` + FIM, 'i'));
    pega(new RegExp(String.raw`\bpara\s+(?!o cart|seu|sua)(.+?)` + FIM, 'i'));
    pega(new RegExp(String.raw`\bpagou\s+R\$\s?[\d.,]+\s+(?:a|à|ao|para)\s+(.+?)` + FIM, 'i'));
    pega(/final \d{3,4}\s*[-–:]\s*(.+?)\s+R\$/i); // "cartão final 1234 - IFOOD R$ 54,90"
    pega(/^(.+?)\s*[-–:]\s*R\$\s?[\d.,]+/i); // "IFOOD - R$ 54,90"
  } else {
    pega(new RegExp(String.raw`R\$\s?[\d.,]+\s+(?:de|do|da)\s+(.+?)` + FIM, 'i'));
    pega(new RegExp(String.raw`\b(?:enviou|transferiu)\b.*?\b(?:de|do|da)\s+(.+?)` + FIM, 'i'));
    pega(new RegExp(String.raw`^(.+?)\s+(?:te )?(?:enviou|transferiu|pagou)`, 'i'));
  }
  for (const c of candidatos) {
    const limpo = limparLocal(c);
    if (ehLocalValido(limpo)) return limpo;
  }
  return undefined;
}

/** Lugar a partir da descrição de um extrato (tira "Compra no débito -", "Pix enviado -" etc.). */
export function localDoExtrato(descricao: string): string | undefined {
  const s = descricao
    .replace(
      /^(?:compra(?: no)?(?: cart[aã]o)?(?: de)?(?: d[eé]bito| cr[eé]dito)?|pagamento(?: de)?(?: boleto)?|pix (?:enviado|recebido|transf\.?)|transfer[eê]ncia (?:enviada|recebida)(?: pelo pix)?|ted (?:enviada|recebida)|d[eé]bito autom[aá]tico|pag\.?|compra internacional|cp)\s*[-–:]?\s*/i,
      '',
    )
    .replace(/\s[-–]\s.*\b(?:ag[eê]ncia|ag\.|conta|cc)\b.*$/i, '') // "Fulano - Banco X Agência 1 Conta 2"
    .replace(/\s[-–]\s\d{2,3}\.\d{3}\.\d{3}.*$/, ''); // CPF/CNPJ
  const limpo = limparLocal(s);
  return ehLocalValido(limpo) ? limpo : undefined;
}
