import Papa from 'papaparse';
import type { Movimento, TipoMov } from '../db';
import { categorizar } from './categorias';
import { lerValor } from './format';

export type NovoMovimento = Omit<Movimento, 'id'>;

/** Assinatura simples para não duplicar o mesmo lançamento ao importar duas vezes. */
export function chaveMovimento(data: string, valor: number, descricao: string, tipo: TipoMov) {
  const base = `${data.slice(0, 10)}|${valor.toFixed(2)}|${descricao.trim().toLowerCase()}|${tipo}`;
  let h = 5381;
  for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) >>> 0;
  return `${base.slice(0, 10)}-${h.toString(36)}`;
}

function montar(dataISO: string, valorAssinado: number, descricao: string, origem: Movimento['origem']): NovoMovimento | null {
  if (!dataISO || !valorAssinado) return null;
  const tipo: TipoMov = valorAssinado < 0 ? 'saida' : 'entrada';
  const valor = Math.abs(valorAssinado);
  const desc = descricao.replace(/\s+/g, ' ').trim() || 'Sem descrição';
  return { data: dataISO, valor, tipo, descricao: desc, categoria: categorizar(desc, tipo), origem, chave: chaveMovimento(dataISO, valor, desc, tipo) };
}

/** Aceita DD/MM/AAAA, DD/MM/AA, DD/MM (ano atual), AAAA-MM-DD e AAAAMMDD. Retorna ISO ao meio-dia local. */
export function lerData(txt: string, anoPadrao = new Date().getFullYear()): string {
  const s = txt.trim();
  let a: number, m: number, d: number;
  let r = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (r) [a, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{4})(\d{2})(\d{2})/))) [a, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/))) {
    d = +r[1];
    m = +r[2];
    a = r[3] ? (r[3].length === 2 ? 2000 + +r[3] : +r[3]) : anoPadrao;
  } else return '';
  const dt = new Date(a, m - 1, d, 12, 0, 0);
  return Number.isNaN(dt.getTime()) ? '' : dt.toISOString();
}

const achar = (cab: string[], nomes: string[]) =>
  cab.findIndex((c) => nomes.some((n) => c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(n)));

/** CSV de qualquer banco: procura colunas de data, valor e descrição pelo nome. */
export function lerCSV(texto: string): NovoMovimento[] {
  const res = Papa.parse<string[]>(texto.trim(), { skipEmptyLines: true });
  const linhas = res.data;
  if (linhas.length < 2) return [];
  const cab = linhas[0].map((c) => String(c));
  const iData = achar(cab, ['data', 'date', 'dt']);
  const iValor = achar(cab, ['valor', 'amount', 'value', 'quantia']);
  const iDesc = achar(cab, ['descricao', 'description', 'title', 'historico', 'estabelecimento', 'lancamento', 'memo']);
  if (iData < 0 || iValor < 0) return [];
  const corpo = linhas.slice(1);
  // Fatura de cartão costuma vir só com valores positivos: nesse caso, são todos gastos.
  const todosPositivos = corpo.every((l) => !String(l[iValor] ?? '').includes('-'));
  const out: NovoMovimento[] = [];
  for (const l of corpo) {
    let v = lerValor(l[iValor]);
    if (todosPositivos) v = -Math.abs(v);
    const mov = montar(lerData(String(l[iData] ?? '')), v, String(l[iDesc] ?? cab[iDesc] ?? ''), 'extrato');
    if (mov) out.push(mov);
  }
  return out;
}

/** OFX: formato padrão de extrato exportado pela maioria dos bancos. */
export function lerOFX(texto: string): NovoMovimento[] {
  const out: NovoMovimento[] = [];
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  const campo = (b: string, nome: string) => b.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim() ?? '';
  for (const b of blocos) {
    const v = lerValor(campo(b, 'TRNAMT'));
    const desc = campo(b, 'MEMO') || campo(b, 'NAME');
    const mov = montar(lerData(campo(b, 'DTPOSTED')), v, desc, 'extrato');
    if (mov) out.push(mov);
  }
  return out;
}

const SAIDA_PDF = /(compra|pagamento|pago|enviad|d[eé]bito|saque|tarifa|pix enviado|transfer[eê]ncia enviada)/i;
const ENTRADA_PDF = /(recebid|cr[eé]dito|dep[oó]sito|estorno|sal[aá]rio|rendimento|pix recebido|transfer[eê]ncia recebida)/i;

/**
 * Linhas de texto de um PDF de extrato. Cada banco tem um layout, então a leitura é
 * "melhor esforço": procura linhas com data e valor. A pessoa revisa antes de salvar.
 */
export function lerLinhasExtrato(linhas: string[], anoPadrao = new Date().getFullYear()): NovoMovimento[] {
  const out: NovoMovimento[] = [];
  const reValor = /(-|−)?\s?(?:R\$\s?)?(-|−)?(\d{1,3}(?:\.\d{3})*,\d{2})(\s?[-DC])?(?!\d)/g;
  let dataAtual = '';
  for (const bruta of linhas) {
    const linha = bruta.replace(/\s+/g, ' ').trim();
    const mData = linha.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2})/);
    if (mData) dataAtual = lerData(mData[1], anoPadrao);
    if (!dataAtual) continue;
    const valores = [...linha.matchAll(reValor)];
    if (!valores.length) continue;
    // Primeiro valor da linha é o lançamento; os seguintes costumam ser saldo.
    const v = valores[0];
    const negativo = Boolean(v[1] || v[2] || v[4]?.trim() === '-' || v[4]?.trim() === 'D');
    let desc = linha.replace(mData?.[0] ?? '', '').slice(0, v.index! - (mData?.[0].length ?? 0)).trim();
    if (!desc) desc = linha.replace(mData?.[0] ?? '', '').replace(v[0], '').trim();
    if (!desc || /^saldo/i.test(desc)) continue;
    let sinal = negativo ? -1 : 0;
    if (!sinal) sinal = SAIDA_PDF.test(desc) ? -1 : ENTRADA_PDF.test(desc) ? 1 : -1;
    const mov = montar(dataAtual, sinal * lerValor(v[3]), desc, 'extrato');
    if (mov) out.push(mov);
  }
  return out;
}

/** Extrai as linhas de texto de um PDF no próprio aparelho (sem enviar para lugar nenhum). */
export async function linhasDoPDF(arquivo: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: arquivo }).promise;
  const linhas: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const conteudo = await pagina.getTextContent();
    const porY = new Map<number, { x: number; t: string }[]>();
    for (const item of conteudo.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const chave = [...porY.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      if (!porY.has(chave)) porY.set(chave, []);
      porY.get(chave)!.push({ x: item.transform[4], t: item.str });
    }
    [...porY.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, itens]) => linhas.push(itens.sort((a, b) => a.x - b.x).map((i) => i.t).join(' ')));
  }
  return linhas;
}

export async function lerArquivoExtrato(arquivo: File): Promise<NovoMovimento[]> {
  const nome = arquivo.name.toLowerCase();
  if (nome.endsWith('.pdf')) return lerLinhasExtrato(await linhasDoPDF(await arquivo.arrayBuffer()));
  const texto = await arquivo.text();
  if (nome.endsWith('.ofx') || /<OFX>/i.test(texto)) return lerOFX(texto);
  return lerCSV(texto);
}
