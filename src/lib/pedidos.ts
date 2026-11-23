import { lerCache, salvarCache } from '../db';
import { avisar } from './avisos';

/**
 * Pedidos de convite (só para a administradora): quem pediu e ainda espera, e quem já foi aceito.
 * O app avisa quando chega um pedido novo e lembra dos que esperam há mais de 2 dias.
 */
export interface PedidoPendente {
  id: string;
  nome: string;
  email: string;
  mensagem?: string;
  criado_em: number;
}
export interface Aceito {
  nome: string;
  email: string;
  temConta: boolean;
}

export const DOIS_DIAS = 2 * 24 * 3600 * 1000;

export async function souAdmin() {
  const c = await lerCache<{ admin: boolean; em: number }>('sou-admin');
  if (c?.valor && Date.now() - c.valor.em < 6 * 3600 * 1000) return c.valor.admin;
  const r = await fetch('/api/eu', { credentials: 'same-origin' });
  if (!r.ok) return c?.valor?.admin ?? false;
  const { admin } = (await r.json()) as { admin: boolean };
  await salvarCache('sou-admin', { admin, em: Date.now() });
  return admin;
}

export async function buscarPedidos(): Promise<{ pedidos: PedidoPendente[]; aceitos: Aceito[] }> {
  const r = await fetch('/api/pedidos', { credentials: 'same-origin' });
  if (!r.ok) throw new Error('Não foi possível carregar os pedidos agora.');
  const c = (await r.json()) as { pedidos: PedidoPendente[]; aceitos?: Aceito[] };
  await salvarCache('pedidos-pendentes', c.pedidos.map((p) => ({ id: p.id, nome: p.nome, criado_em: p.criado_em })));
  window.dispatchEvent(new Event('mp-pedidos'));
  return { pedidos: c.pedidos, aceitos: c.aceitos ?? [] };
}

/** Confere os pedidos e avisa: um aviso para cada pedido novo; e, uma vez por dia, o lembrete dos que esperam há mais de 2 dias. */
export async function vigiarPedidos() {
  if (!navigator.onLine || !(await souAdmin())) return;
  const { pedidos } = await buscarPedidos();
  const vistos = (await lerCache<string[]>('pedidos-avisados'))?.valor;
  const novos = vistos ? pedidos.filter((p) => !vistos.includes(p.id)) : [];
  await salvarCache('pedidos-avisados', [...new Set([...(vistos ?? []), ...pedidos.map((p) => p.id)])].slice(-500));
  if (novos.length === 1) await avisar('Novo pedido de convite', `${novos[0].nome} (${novos[0].email}) pediu um convite.`, `pedido-${novos[0].id}`);
  else if (novos.length > 1) await avisar('Novos pedidos de convite', `${novos.length} pessoas pediram convite: ${novos.map((p) => p.nome).join(', ')}.`, `pedidos-${novos.map((p) => p.id).join('-')}`.slice(0, 200));
  const antigos = pedidos.filter((p) => Date.now() - p.criado_em > DOIS_DIAS);
  if (antigos.length) {
    const hoje = new Date().toISOString().slice(0, 10);
    await avisar(
      'Tem convites para serem aceitos',
      `${antigos.length === 1 ? `${antigos[0].nome} espera` : `${antigos.length} pessoas esperam`} há mais de 2 dias. Abra Ajustes → Convites.`,
      `lembrete-convites-${hoje}`,
    );
  }
}
