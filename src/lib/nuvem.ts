import { db, exportarTudo, importarTudo, lerCache, salvarCache } from '../db';
import type { ConfigBloqueio } from './bloqueio';

/**
 * Cópia da conta no servidor: os dados (respostas do início, planos, gastos, investimentos,
 * compras e a senha do app) voltam sozinhos ao entrar em qualquer aparelho, mesmo depois de
 * desinstalar. Cada mudança é enviada alguns segundos depois; ao abrir, o app baixa a versão
 * mais nova. Tudo segue funcionando sem internet e é enviado quando a conexão voltar.
 */
interface Estado {
  email?: string;
  versao: number;
  sujo: boolean;
  alteradoEm: number;
}
const CHAVE = 'mp_nuvem';
const lerEstado = (): Estado => {
  try {
    return { versao: 0, sujo: false, alteradoEm: 0, ...(JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Partial<Estado>) };
  } catch {
    return { versao: 0, sujo: false, alteradoEm: 0 };
  }
};
const salvarEstado = (e: Estado) => {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(e));
  } catch {
    /* sem armazenamento */
  }
};

/* ---------- compactar / descompactar ---------- */
async function compactar(texto: string) {
  const fluxo = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
  const u = new Uint8Array(await new Response(fluxo).arrayBuffer());
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
async function descompactar(b64: string) {
  const u = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const fluxo = new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(fluxo).text();
}

/* ---------- montar / aplicar a cópia ---------- */
async function montarCopia() {
  const tudo = await exportarTudo();
  const b = (await lerCache<ConfigBloqueio>('bloqueio'))?.valor;
  // Senha do app vai junto (só o hash). Digital/rosto é do aparelho e é ativado de novo em cada um.
  const bloqueio = b?.ativo ? { ativo: true, sal: b.sal, hash: b.hash, iteracoes: b.iteracoes, bloquearApos: b.bloquearApos, erros: 0, rodadasDeErro: 0 } : undefined;
  return compactar(JSON.stringify({ ...tudo, bloqueio }));
}

let aplicando = false;
async function aplicarCopia(b64: string) {
  const dados = JSON.parse(await descompactar(b64)) as Awaited<ReturnType<typeof exportarTudo>> & { bloqueio?: ConfigBloqueio };
  aplicando = true;
  try {
    await importarTudo(dados);
    if (dados.bloqueio) {
      const atual = (await lerCache<ConfigBloqueio>('bloqueio'))?.valor;
      // Mantém a digital/rosto deste aparelho se a senha for a mesma.
      await salvarCache('bloqueio', { ...dados.bloqueio, biometria: atual?.hash === dados.bloqueio.hash ? atual.biometria : undefined });
    }
  } finally {
    setTimeout(() => (aplicando = false), 0);
  }
}

/* ---------- conversa com o servidor ---------- */
async function pedir(init?: RequestInit) {
  const r = await fetch('/api/dados', { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...init });
  const c = (await r.json().catch(() => ({}))) as { email?: string; vazio?: boolean; versao?: number; atualizadoEm?: number; dados?: string; erro?: string };
  return { status: r.status, ...c };
}

let enviando: Promise<void> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

async function enviar() {
  const e = lerEstado();
  if (!e.sujo || !navigator.onLine) return;
  // Nunca sobe um aparelho "vazio" (sem as respostas do início) por cima da conta.
  if (!(await db.perfil.get('eu'))?.concluiuInicio) return;
  const dados = await montarCopia();
  const r = await pedir({ method: 'PUT', body: JSON.stringify({ base: e.versao, dados }) });
  if (r.status === 200 && r.versao) salvarEstado({ ...lerEstado(), versao: r.versao, sujo: false });
  else if (r.status === 409) await sincronizar(); // outro aparelho salvou antes: decide quem fica
}

/** Agenda o envio (junta várias mudanças seguidas num envio só). */
function agendar() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    enviando = (enviando ?? Promise.resolve()).then(enviar).catch(() => undefined);
  }, 4000);
}

/** Marca que algo mudou neste aparelho. */
export function houveMudanca() {
  if (aplicando) return;
  salvarEstado({ ...lerEstado(), sujo: true, alteradoEm: Date.now() });
  agendar();
}

/**
 * Compara este aparelho com a cópia da conta e deixa os dois iguais.
 * Devolve 'restaurado' quando os dados vieram do servidor.
 */
export async function sincronizar(): Promise<'restaurado' | 'enviado' | 'igual' | 'sem-conexao'> {
  if (!navigator.onLine) return 'sem-conexao';
  let r;
  try {
    r = await pedir();
  } catch {
    return 'sem-conexao';
  }
  if (r.status !== 200 || !r.email) return 'sem-conexao';
  const e = lerEstado();
  const temLocal = Boolean((await db.perfil.get('eu'))?.concluiuInicio);

  // Outra pessoa entrou neste aparelho: os dados daqui não são dela.
  if (e.email && e.email !== r.email) {
    await Promise.all([db.perfil.clear(), db.planos.clear(), db.movimentos.clear(), db.investimentos.clear(), db.compras.clear(), db.cache.delete('bloqueio')]);
    salvarEstado({ email: r.email, versao: 0, sujo: false, alteradoEm: 0 });
    return sincronizar();
  }

  if (r.vazio) {
    // Primeira vez: sobe o que já existe neste aparelho.
    salvarEstado({ ...e, email: r.email, versao: 0, sujo: temLocal });
    if (temLocal) await enviar();
    return temLocal ? 'enviado' : 'igual';
  }

  const servidorMaisNovo = (r.versao ?? 0) !== e.versao;
  const localMaisNovoQueServidor = e.sujo && e.alteradoEm > (r.atualizadoEm ?? 0);
  // Aparelho sem dados (instalou de novo, outro navegador): sempre traz a cópia da conta.
  if (r.dados && (!temLocal || (servidorMaisNovo && !localMaisNovoQueServidor))) {
    await aplicarCopia(r.dados);
    salvarEstado({ email: r.email, versao: r.versao ?? 0, sujo: false, alteradoEm: Date.now() });
    return 'restaurado';
  }
  if (e.sujo) {
    // Este aparelho mudou depois da cópia: ele vence e sobe a versão dele.
    salvarEstado({ ...e, email: r.email, versao: r.versao ?? 0, sujo: true });
    await enviar();
    return 'enviado';
  }
  salvarEstado({ ...e, email: r.email });
  return 'igual';
}

/** Liga a cópia automática: observa as mudanças e sincroniza ao abrir, ao voltar ao app e ao reconectar. */
let ligado = false;
export function ligarNuvem() {
  if (ligado) return;
  ligado = true;
  for (const t of [db.perfil, db.planos, db.movimentos, db.investimentos, db.compras]) {
    t.hook('creating', () => void houveMudanca());
    t.hook('updating', () => void houveMudanca());
    t.hook('deleting', () => void houveMudanca());
  }
  db.cache.hook('creating', (k) => void (k === 'bloqueio' && houveMudanca()));
  db.cache.hook('updating', (_m, k) => void (k === 'bloqueio' && houveMudanca()));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sincronizar().catch(() => undefined);
    else if (lerEstado().sujo) enviar().catch(() => undefined); // saindo do app: envia o que falta
  });
  window.addEventListener('online', () => sincronizar().catch(() => undefined));
}

/** Apaga tudo deste aparelho (usado ao excluir a conta). */
export async function apagarAparelho() {
  ligado = true; // não reenvia nada
  aplicando = true;
  await db.delete();
  try {
    localStorage.clear();
  } catch {
    /* ignora */
  }
  if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
}
