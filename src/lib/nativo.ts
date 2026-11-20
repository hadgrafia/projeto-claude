import { Capacitor, registerPlugin } from '@capacitor/core';
import { db } from '../db';
import { categorizar } from './categorias';

/**
 * Ponte com o app Android. O serviço nativo lê as notificações de pagamento de
 * qualquer banco ou app, guarda só o essencial (valor, tipo, lugar, horário, nome do app)
 * e, se não achar o nome do lugar, pergunta NA HORA com uma notificação que tem campo de resposta.
 * Aqui o app web busca esses lançamentos e os salva no banco local.
 */
interface Capturado {
  id: string;
  quando: number;
  valor: number;
  tipo: 'saida' | 'entrada';
  local?: string;
  app: string;
}

interface LeitorNotificacoes {
  status(): Promise<{ permitido: boolean; avisosPermitidos: boolean }>;
  abrirPermissao(): Promise<void>;
  pedirPermissaoAvisos(): Promise<{ avisosPermitidos: boolean }>;
  pendentes(): Promise<{ itens: Capturado[] }>;
  confirmar(opcoes: { ids: string[] }): Promise<void>;
}

export const ehAppAndroid = () => Capacitor.getPlatform() === 'android';
export const Leitor = registerPlugin<LeitorNotificacoes>('LeitorNotificacoes');

export async function sincronizar() {
  if (!ehAppAndroid()) return 0;
  const { itens } = await Leitor.pendentes();
  if (!itens.length) return 0;
  const chaves = itens.map((i) => `n-${i.id}`);
  const existentes = new Map((await db.movimentos.where('chave').anyOf(chaves).toArray()).map((m) => [m.chave, m]));
  const novos = [];
  const resolvidos: string[] = [];
  for (const i of itens) {
    const local = i.local?.trim() || undefined;
    const ja = existentes.get(`n-${i.id}`);
    if (ja) {
      // A pessoa respondeu na notificação depois que o gasto já tinha chegado ao app.
      if (ja.localPendente && local) {
        const auto = categorizar(local, i.tipo);
        await db.movimentos.update(ja.id!, { local, localPendente: false, descricao: local, categoria: auto !== 'Outros' ? auto : ja.categoria });
      }
      if (!ja.localPendente || local) resolvidos.push(i.id);
      continue;
    }
    novos.push({
      data: new Date(i.quando).toISOString(),
      valor: i.valor,
      tipo: i.tipo,
      descricao: local ?? (i.tipo === 'entrada' ? 'Entrada' : 'Gasto'),
      local,
      localPendente: !local,
      avisadoPor: i.app,
      categoria: categorizar(local ?? '', i.tipo),
      origem: 'notificacao' as const,
      chave: `n-${i.id}`,
    });
    // Sem lugar ainda: continua no aparelho até a pessoa responder (na notificação ou no app).
    if (local) resolvidos.push(i.id);
  }
  if (novos.length) await db.movimentos.bulkAdd(novos);
  if (resolvidos.length) await Leitor.confirmar({ ids: resolvidos });
  return novos.length;
}

/** A pessoa informou o lugar dentro do app: fecha a pergunta que estava na barra de notificações. */
export function lugarInformadoNoApp(chave: string) {
  if (ehAppAndroid() && chave.startsWith('n-')) Leitor.confirmar({ ids: [chave.slice(2)] }).catch(() => undefined);
}

/** Sincroniza ao abrir o app e sempre que ele volta para a tela. Retorna a função de limpeza. */
export function iniciarLeituraNativa(): (() => void) | undefined {
  if (!ehAppAndroid()) return undefined;
  const rodar = () => document.visibilityState === 'visible' && sincronizar().catch(() => undefined);
  rodar();
  document.addEventListener('visibilitychange', rodar);
  const intervalo = window.setInterval(rodar, 15000);
  return () => {
    document.removeEventListener('visibilitychange', rodar);
    window.clearInterval(intervalo);
  };
}
