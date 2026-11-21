import { db, type Conjunto, type Investimento, type Movimento, type Perfil, type Plano, type ResumoMembro } from '../db';
import { analisarMes } from './feedback';
import { aporteDoPlano, resumoRenda, totalGuardado, valorLivreMensal } from './finance';

/**
 * Planos em conjunto, cifrados de ponta a ponta.
 * - A chave AES-256 do plano é criada no aparelho e só viaja dentro do link de convite
 *   (na parte depois do "#", que o navegador nunca envia ao servidor).
 * - O servidor guarda apenas textos cifrados e o hash do segredo de cada participante.
 * - Cada pessoa compartilha um RESUMO (guardado, aporte, valor livre, onde pode economizar),
 *   nunca a lista de gastos. A renda média só aparece se a pessoa permitir.
 */

export class SessaoExpirada extends Error {
  constructor() {
    super('Sua sessão expirou. Toque em "Entrar de novo" e use seu e-mail e senha.');
  }
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
export const novoId = () => b64url(crypto.getRandomValues(new Uint8Array(24)));

async function sha256(texto: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function importarChave(chave: string) {
  return crypto.subtle.importKey('raw', deB64url(chave), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function cifrarJSON(obj: unknown, chave: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importarChave(chave), new TextEncoder().encode(JSON.stringify(obj)));
  return `${b64url(iv)}.${b64url(new Uint8Array(ct))}`;
}

export async function decifrarJSON<T>(blob: string, chave: string): Promise<T> {
  const [iv, ct] = blob.split('.');
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64url(iv) }, await importarChave(chave), deB64url(ct));
  return JSON.parse(new TextDecoder().decode(claro)) as T;
}

/** Parte do plano que é igual para todos: o que é, quanto custa e até quando. */
type Definicao = Pick<Plano, 'nome' | 'tipo' | 'meta' | 'prazo' | 'respostas' | 'composicao'>;
const definicao = (p: Plano): Definicao => ({ nome: p.nome, tipo: p.tipo, meta: p.meta, prazo: p.prazo, respostas: p.respostas, composicao: p.composicao });

async function api<T>(caminho: string, init: RequestInit = {}, c?: Pick<Conjunto, 'membroId' | 'segredo'>): Promise<T> {
  if (!navigator.onLine) throw new Error('Sem internet. O plano em conjunto atualiza quando a conexão voltar.');
  let r: Response;
  try {
    r = await fetch(`/api${caminho}`, {
      ...init,
      credentials: 'same-origin',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', ...(c ? { 'X-Membro': `${c.membroId}:${c.segredo}` } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new SessaoExpirada();
  }
  // Sem sessão, o servidor responde 401 (ou redireciona para a página Entrar).
  if (r.type === 'opaqueredirect' || r.status === 401 || !(r.headers.get('Content-Type') ?? '').includes('json')) {
    if (r.status === 401 || r.type === 'opaqueredirect' || r.status === 302) throw new SessaoExpirada();
    throw new Error('O servidor do app ainda não está publicado.');
  }
  const corpo = (await r.json()) as T & { erro?: string };
  if (!r.ok) throw new Error(corpo.erro ?? `Erro ${r.status}`);
  return corpo;
}

export interface DadosLocais {
  perfil?: Perfil;
  movimentos: Movimento[];
  investimentos: Investimento[];
}

/** O que esta pessoa compartilha com o grupo sobre este plano. */
export function meuResumo(plano: Plano, d: DadosLocais, membroId: string, mostrarRenda: boolean): ResumoMembro {
  const livre = valorLivreMensal(d.perfil, d.movimentos);
  const renda = resumoRenda(d.perfil, d.movimentos).mensal;
  return {
    membroId,
    apelido: d.perfil?.nome?.trim() || 'Participante',
    guardado: Math.round(totalGuardado(plano, d.investimentos)),
    aporteMensal: Math.round(aporteDoPlano(plano, livre)),
    livreMensal: Math.round(livre),
    rendaMedia: mostrarRenda ? Math.round(renda) : undefined,
    sugestoes: analisarMes(d.movimentos, renda)
      .filter((s) => s.status !== 'manter')
      .slice(0, 3)
      .map((s) => ({ categoria: s.categoria, status: s.status as 'rever' | 'cortar', ganho: Math.round(s.ganhoMensal) })),
    atualizadoEm: new Date().toISOString(),
  };
}

export async function criarConjunto(plano: Plano, d: DadosLocais) {
  const c: Conjunto = { id: novoId(), membroId: novoId(), segredo: novoId(), chave: b64url(crypto.getRandomValues(new Uint8Array(32))), versao: 1, mostrarRenda: false, membros: [] };
  const resumo = meuResumo(plano, d, c.membroId, false);
  await api('/conjunto', {
    method: 'POST',
    body: JSON.stringify({
      id: c.id,
      membroId: c.membroId,
      segredoHash: await sha256(c.segredo),
      blobPlano: await cifrarJSON(definicao(plano), c.chave),
      blobMembro: await cifrarJSON(resumo, c.chave),
    }),
  });
  c.membros = [resumo];
  c.sincronizadoEm = new Date().toISOString();
  await db.planos.update(plano.id!, { conjunto: c });
  return c;
}

/** Convite pessoal para o familiar criar a conta no app (se ainda não tiver). */
export async function convidarParaConta(email: string) {
  return api<{ ok: boolean; link?: string; jaTemConta?: boolean }>('/acesso/convidar', { method: 'POST', body: JSON.stringify({ email }) });
}

/** Junta o convite da conta com o convite do plano: a pessoa cria a conta e cai direto no plano. */
export const juntarConvites = (linkConta: string, linkPlano: string) => `${linkConta}&volta=%2Fapp%2F${linkPlano.slice(linkPlano.indexOf('#'))}`;

/** Link de convite de uso único (48 h). A chave vai depois do "#": nunca chega ao servidor. */
export async function gerarConvite(c: Conjunto) {
  const convite = novoId();
  await api(`/conjunto/${c.id}/convite`, { method: 'POST', body: JSON.stringify({ conviteHash: await sha256(convite) }) }, c);
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/convite?p=${c.id}&c=${convite}&k=${c.chave}`;
}

export async function entrarNoConjunto(p: string, convite: string, chave: string, d: DadosLocais) {
  const membroId = novoId();
  const segredo = novoId();
  const provisorio = { nome: '', tipo: 'outro', meta: 0, guardado: 0, percentual: 0, respostas: {}, criadoEm: '' } as Plano;
  await api(`/conjunto/${p}/entrar`, {
    method: 'POST',
    body: JSON.stringify({
      convite,
      membroId,
      segredoHash: await sha256(segredo),
      blobMembro: await cifrarJSON(meuResumo(provisorio, d, membroId, false), chave),
    }),
  });
  const c: Conjunto = { id: p, membroId, segredo, chave, versao: 0, mostrarRenda: false, membros: [] };
  const id = await db.planos.add({ nome: 'Plano em conjunto', tipo: 'outro', meta: 0, guardado: 0, percentual: 0, respostas: {}, criadoEm: new Date().toISOString(), conjunto: c });
  await sincronizarConjunto((await db.planos.get(id))!, d);
  return id;
}

/** Envia meu resumo e traz o plano e os resumos de todos. */
export async function sincronizarConjunto(plano: Plano, d: DadosLocais) {
  const c = plano.conjunto;
  if (!c) return;
  await api(`/conjunto/${c.id}/membro`, { method: 'PUT', body: JSON.stringify({ blob: await cifrarJSON(meuResumo(plano, d, c.membroId, c.mostrarRenda), c.chave) }) }, c);
  const r = await api<{ blobPlano: string; versao: number; membros: { membroId: string; blob: string }[] }>(`/conjunto/${c.id}`, {}, c);
  const membros: ResumoMembro[] = [];
  for (const m of r.membros) {
    try {
      membros.push({ ...(await decifrarJSON<ResumoMembro>(m.blob, c.chave)), membroId: m.membroId });
    } catch {
      /* resumo corrompido ou de outra chave: ignora */
    }
  }
  const mudancas: Partial<Plano> = { conjunto: { ...c, versao: r.versao, membros, sincronizadoEm: new Date().toISOString() } };
  if (r.versao !== c.versao) Object.assign(mudancas, await decifrarJSON<Definicao>(r.blobPlano, c.chave));
  await db.planos.update(plano.id!, mudancas);
}

/** Depois de editar um plano em conjunto: envia a nova definição para todos. */
export async function enviarDefinicao(plano: Plano) {
  const c = plano.conjunto;
  if (!c) return;
  const r = await api<{ versao: number }>(`/conjunto/${c.id}/plano`, { method: 'PUT', body: JSON.stringify({ blob: await cifrarJSON(definicao(plano), c.chave), versao: c.versao }) }, c);
  await db.planos.update(plano.id!, { conjunto: { ...c, versao: r.versao } });
}

export async function sairDoConjunto(plano: Plano) {
  const c = plano.conjunto;
  if (!c) return;
  await api(`/conjunto/${c.id}/membro`, { method: 'DELETE' }, c);
  await db.planos.update(plano.id!, { conjunto: undefined });
}

/** Soma dos outros participantes (o meu valor é sempre recalculado na hora). */
export function somaOutros(plano: Plano) {
  const outros = (plano.conjunto?.membros ?? []).filter((m) => m.membroId !== plano.conjunto?.membroId);
  return { guardado: outros.reduce((a, m) => a + m.guardado, 0), aporte: outros.reduce((a, m) => a + m.aporteMensal, 0), qtd: outros.length };
}

/** Abre a página Entrar (e-mail e senha) e depois volta para a mesma tela do app. */
export const entrarDeNovo = () => {
  location.href = `/entrar/?volta=/app/${location.hash}`;
};

/** Encerra a sessão deste aparelho e vai para a página Entrar. Os dados do aparelho continuam guardados. */
export async function sairDaConta() {
  await fetch('/api/conta/sair', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
  location.href = '/entrar/';
}
