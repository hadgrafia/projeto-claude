import { Capacitor, registerPlugin } from '@capacitor/core';
import { db, lerCache, salvarCache } from '../db';
import { appPermitido } from './appsPagamento';
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
  /** Débito ou crédito, quando o aviso disse (versões antigas do APK não mandam). */
  forma?: 'credito' | 'debito' | 'pix' | 'boleto';
  parcelas?: number;
  /** Código do tipo de aviso (versões antigas do APK não mandam). */
  modelo?: string;
}

interface LeitorNotificacoes {
  status(): Promise<{ permitido: boolean; avisosPermitidos: boolean }>;
  abrirPermissao(): Promise<void>;
  pedirPermissaoAvisos(): Promise<{ avisosPermitidos: boolean }>;
  pendentes(): Promise<{ itens: Capturado[] }>;
  confirmar(opcoes: { ids: string[] }): Promise<void>;
  notificar(opcoes: { titulo: string; texto: string }): Promise<void>;
  apps(): Promise<{ configurado: boolean; permitidos: string[]; padrao: AppInfo[]; ignorados: AppInfo[]; instalados: AppInfo[] }>;
  definirApps(opcoes: { pacotes: string[] }): Promise<void>;
  ignorarModelos(opcoes: { modelos: string[] }): Promise<void>;
}
export interface AppInfo {
  pacote: string;
  nome: string;
}

export const ehAppAndroid = () => Capacitor.getPlatform() === 'android';
export const Leitor = registerPlugin<LeitorNotificacoes>('LeitorNotificacoes');

/**
 * A pessoa apagou um lançamento que veio de um aviso: tira também da fila do leitor do
 * aparelho e anota, para ele nunca mais voltar.
 */
export async function esquecerAviso(chave: string) {
  if (!chave.startsWith('n-')) return;
  const lista = (await lerCache<string[]>('notificacoes-apagadas'))?.valor ?? [];
  await salvarCache('notificacoes-apagadas', [...lista.slice(-200), chave]);
  if (ehAppAndroid()) await Leitor.confirmar({ ids: [chave.slice(2)] }).catch(() => undefined);
}

/**
 * "Não era um gasto": apaga este lançamento e todos os outros do mesmo tipo de aviso,
 * e o tipo vai para a lista de ignorados (aqui e no leitor do aparelho). Devolve quantos apagou.
 */
export async function naoEraGasto(mov: { id?: number; chave: string; modelo?: string }) {
  const iguais = mov.modelo ? await db.movimentos.filter((m) => m.modelo === mov.modelo).toArray() : [];
  const apagar = [...new Map([...iguais, mov].map((m) => [m.chave, m])).values()];
  await db.movimentos.bulkDelete(apagar.map((m) => m.id!).filter(Boolean));
  for (const m of apagar) await esquecerAviso(m.chave);
  if (mov.modelo) {
    const perfil = await db.perfil.get('eu');
    const lista = [...new Set([...(perfil?.avisosIgnorados ?? []), mov.modelo])].slice(-300);
    await db.perfil.update('eu', { avisosIgnorados: lista });
    await enviarIgnorados(lista);
  }
  return apagar.length;
}

/** Passa a lista de tipos de aviso ignorados para o leitor do Android (descarta na hora, sem guardar). */
export async function enviarIgnorados(lista: string[]) {
  if (ehAppAndroid()) await Leitor.ignorarModelos({ modelos: lista }).catch(() => undefined);
}

export async function sincronizar() {
  if (!ehAppAndroid()) return 0;
  const { itens } = await Leitor.pendentes();
  if (!itens.length) return 0;
  const chaves = itens.map((i) => `n-${i.id}`);
  const existentes = new Map((await db.movimentos.where('chave').anyOf(chaves).toArray()).map((m) => [m.chave, m]));
  const novos = [];
  const resolvidos: string[] = [];
  const perfil = await db.perfil.get('eu');
  const aviso = perfil?.limiteAvisoCompra ?? 100;
  const apagados = new Set((await lerCache<string[]>('notificacoes-apagadas'))?.valor ?? []);
  for (const i of itens) {
    const local = i.local?.trim() || undefined;
    const ja = existentes.get(`n-${i.id}`);
    // Apagado pela pessoa, ou de um app fora da lista de apps de pagamento (ex.: cotação do dólar):
    // descarta de vez no aparelho, para não voltar.
    if (!ja && (apagados.has(`n-${i.id}`) || !appPermitido(perfil, i.app) || (i.modelo && perfil?.avisosIgnorados?.includes(i.modelo)))) {
      resolvidos.push(i.id);
      continue;
    }
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
      detalhePendente: i.tipo === 'saida' && i.valor >= aviso,
      ...(i.tipo === 'saida' ? { forma: i.forma, parcelas: i.forma === 'credito' && i.parcelas && i.parcelas > 1 ? i.parcelas : undefined, formaPendente: !i.forma } : {}),
      avisadoPor: i.app,
      categoria: categorizar(local ?? '', i.tipo),
      origem: 'notificacao' as const,
      chave: `n-${i.id}`,
      ...(i.modelo ? { modelo: i.modelo } : {}),
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
