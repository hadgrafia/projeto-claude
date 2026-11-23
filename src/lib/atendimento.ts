import { lerCache, salvarCache } from '../db';
import { avisar } from './avisos';
import { souAdmin } from './pedidos';

/** Atendimento com uma pessoa da equipe (dúvidas que as respostas prontas não resolvem). */
export interface MensagemChamado {
  id: string;
  de: 'pessoa' | 'equipe';
  texto: string;
  em: number;
}
export interface ResumoChamado {
  id: string;
  nome: string;
  status: 'aberto' | 'fechado';
  atualizadoEm: number;
  criadoEm: number;
  naoLidas: number;
}

async function chamar<T>(url: string, corpo?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: corpo === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const c = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(c.erro ?? 'Não foi possível agora. Tente de novo em instantes.');
  return c;
}

// Quem pergunta
export const meuChamado = (marcarLido = true) =>
  chamar<{ chamado: { id: string; status: string; naoLidas: number; mensagens: MensagemChamado[] } | null }>(`/api/suporte${marcarLido ? '?lido=1' : ''}`);
export async function mandarMensagem(texto: string, nome: string) {
  await salvarCache('tem-chamado', true);
  return chamar<{ ok: boolean; novo: boolean }>('/api/suporte', { texto, nome });
}

// Equipe
export const listaChamados = () => chamar<{ chamados: ResumoChamado[] }>('/api/suporte/equipe');
export const abrirChamado = (id: string) => chamar<{ id: string; nome: string; status: string; mensagens: MensagemChamado[] }>(`/api/suporte/equipe/${id}`);
export const responder = (id: string, texto: string) => chamar(`/api/suporte/equipe/${id}`, { texto });
export const mudarStatus = (id: string, fechar: boolean) => chamar(`/api/suporte/equipe/${id}`, fechar ? { fechar: true } : { reabrir: true });

/**
 * Avisos: para a equipe, quando alguém abre um chamado ou manda mensagem nova;
 * para quem perguntou, quando a resposta chega.
 */
export async function vigiarAtendimento() {
  if (!navigator.onLine) return;
  if (await souAdmin()) {
    const { chamados } = await listaChamados();
    const comNovas = chamados.filter((c) => c.naoLidas > 0);
    await salvarCache('chamados-abertos', chamados.filter((c) => c.status === 'aberto').map((c) => ({ id: c.id, nome: c.nome, naoLidas: c.naoLidas })));
    window.dispatchEvent(new Event('mp-chamados'));
    for (const c of comNovas) {
      const chave = `chamado-${c.id}-${c.atualizadoEm}`;
      const ja = (await lerCache<number>(`visto:${c.id}`))?.valor;
      if (ja === c.atualizadoEm) continue;
      await salvarCache(`visto:${c.id}`, c.atualizadoEm);
      const novo = Math.abs(c.atualizadoEm - c.criadoEm) < 5000;
      await avisar(novo ? 'Novo chamado de atendimento' : 'Nova mensagem no atendimento', `${c.nome} ${novo ? 'abriu um chamado' : 'mandou uma mensagem'}. Toque para responder.`, chave);
    }
    return;
  }
  if (!(await lerCache('tem-chamado'))?.valor) return;
  const { chamado } = await meuChamado(false);
  if (chamado?.naoLidas) {
    await salvarCache('resposta-atendimento', chamado.naoLidas);
    window.dispatchEvent(new Event('mp-chamados'));
    await avisar('Resposta do atendimento', 'Uma pessoa da equipe respondeu a sua dúvida. Toque para ver.', `resposta-${chamado.id}-${chamado.naoLidas}`);
  }
}
