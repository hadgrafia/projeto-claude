import type { TipoMov } from '../db';
import { categorizar } from './categorias';
import { lerValor } from './format';
import { extrairLocal, limparLocal, ehLocalValido } from './lugar';
import { avisoIgnoravel, lerNotificacao } from './notificacao';

/**
 * Lançamento rápido para quem usa o app pelo navegador (onde o sistema não deixa ler notificações):
 *  - "Compartilhar comprovante" no app do banco → Meus Planos (o arquivo ou texto chega aqui);
 *  - um app de automação (Android) ou o app Atalhos (iPhone) abre o link
 *    /app/#/lancar?texto=…  com o texto da notificação, ou  ?valor=…&local=…
 * Tudo é lido aqui no aparelho e a pessoa confirma antes de salvar: um link de fora nunca grava sozinho.
 */
export interface Lido {
  valor?: number;
  local?: string;
  tipo: TipoMov;
  categoria: string;
  origemTexto?: string;
}

const VALOR = /R\$\s?-?\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:,\d{2})?)/i;
const ROTULOS_LUGAR = [/(?:^|\n)\s*(?:para|destino|destinat[aá]rio|favorecido|recebedor|estabelecimento|loja|benefici[aá]rio)\s*:?\s*\n?\s*([^\n]{2,60})/i, /(?:^|\n)\s*nome\s*:?\s*\n?\s*([^\n]{2,60})/i];

/** Comprovante (Pix, TED, boleto, cartão) em texto: valor e para quem foi. */
export function lerComprovante(texto: string): Lido | null {
  const t = texto.replace(/\r/g, '');
  const valorRotulado = t.match(/valor(?: total| pago| da transa[cç][aã]o)?\s*:?\s*\n?\s*(R\$\s?[\d.,]+)/i)?.[1];
  const m = (valorRotulado ?? t).match(VALOR);
  const valor = m ? lerValor(m[1]) : undefined;
  if (!valor) return null;
  const tipo: TipoMov = /recebid[oa]|voc[eê] recebeu|cr[eé]dito recebido/i.test(t) ? 'entrada' : 'saida';
  let local: string | undefined;
  for (const r of ROTULOS_LUGAR) {
    const achado = t.match(r)?.[1];
    if (achado && ehLocalValido(limparLocal(achado))) {
      local = limparLocal(achado);
      break;
    }
  }
  // Tudo numa linha só: "… Para Padaria Pão Quente LTDA CPF …"
  if (!local) {
    const umaLinha = t.replace(/\s+/g, ' ');
    const achado = umaLinha.match(/\b(?:para|destinat[aá]rio|favorecido|recebedor|estabelecimento|benefici[aá]rio)\s*:?\s+(.{2,60}?)(?=\s+(?:CPF|CNPJ|Institui|Banco|Ag[eê]ncia|Conta|Chave|Data|ID|Tipo|Valor|Autentica)|$)/i)?.[1];
    if (achado && ehLocalValido(limparLocal(achado))) local = limparLocal(achado);
  }
  local ??= extrairLocal(t.replace(/\n/g, ' '), tipo);
  return { valor, local, tipo, categoria: categorizar(`${local ?? ''} ${t}`, tipo) };
}

/** Lê o que veio no link (texto de notificação, ou valor e lugar prontos). */
export function lerParametros(p: URLSearchParams): Lido | null {
  const texto = (p.get('texto') ?? '').slice(0, 2000);
  const titulo = (p.get('titulo') ?? '').slice(0, 300);
  const app = (p.get('app') ?? '').slice(0, 60);
  if (texto || titulo) {
    if (avisoIgnoravel(`${titulo} ${texto}`)) return null;
    const n = lerNotificacao(app || 'Automação', titulo, texto);
    if (n) return { valor: n.valor, local: n.local, tipo: n.tipo, categoria: n.categoria, origemTexto: app || undefined };
    const c = lerComprovante(`${titulo}\n${texto}`);
    if (c) return { ...c, origemTexto: app || undefined };
    return null;
  }
  const valor = p.get('valor') ? lerValor(String(p.get('valor')).replace(/[^\d.,-]/g, '')) : undefined;
  const localBruto = (p.get('local') ?? '').slice(0, 80);
  const local = localBruto && ehLocalValido(limparLocal(localBruto)) ? limparLocal(localBruto) : undefined;
  if (!valor && !local) return null;
  const tipo: TipoMov = p.get('tipo') === 'entrada' ? 'entrada' : 'saida';
  return { valor: valor ? Math.abs(valor) : undefined, local, tipo, categoria: categorizar(local ?? '', tipo), origemTexto: (p.get('origem') ?? '').slice(0, 40) || undefined };
}

/** O que foi compartilhado com o app (guardado pelo service worker por um instante). */
export async function pegarCompartilhado(): Promise<{ titulo: string; texto: string; link: string; arquivo?: File } | null> {
  if (!('caches' in window)) return null;
  const cache = await caches.open('mp-compartilhado');
  const dados = await cache.match('dados');
  if (!dados) return null;
  const d = (await dados.json()) as { titulo: string; texto: string; link: string; nome: string; tipo: string };
  const r = await cache.match('arquivo');
  const arquivo = r ? new File([await r.blob()], d.nome || 'comprovante', { type: d.tipo }) : undefined;
  await caches.delete('mp-compartilhado'); // some do aparelho assim que é lido
  return { titulo: d.titulo, texto: d.texto, link: d.link, arquivo };
}

/** Extrato inteiro compartilhado: a tela Importar pega daqui. */
let pendente: File | undefined;
export const guardarArquivoParaImportar = (f: File) => (pendente = f);
export const pegarArquivoParaImportar = () => {
  const f = pendente;
  pendente = undefined;
  return f;
};
