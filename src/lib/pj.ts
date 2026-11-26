import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { db, type Perfil } from '../db';
import { avisar } from './avisos';
import { chaveMes, reais } from './format';
import { chaveMovimento } from './importar';

/**
 * PJ: DAS todo mês (MEI ou Simples Nacional) e emissão de notas.
 * O valor muda mês a mês: a pessoa marca "Paguei" com o valor e ele vira um gasto (categoria Impostos),
 * entrando na média de gastos. Lembretes: no celular (Android, agendado, mesmo com o app fechado)
 * e no app (3 dias antes, no dia e em atraso).
 */
export const LINKS_PJ = {
  nfse: 'https://www.nfse.gov.br/EmissorNacional/Login?ReturnUrl=%2femissornacional',
  dasMei: 'https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao',
  portalSimples: 'https://www8.receita.fazenda.gov.br/SimplesNacional/',
};

export type Das = NonNullable<Perfil['das']>;

export const ehPJ = (perfil?: Perfil) => perfil?.vinculo === 'pj';

/** Situação do DAS deste mês. */
export function situacaoDas(das: Das | undefined, hoje = new Date()) {
  if (!das) return undefined;
  const mes = chaveMes(hoje);
  const pago = das.pagos[mes];
  const vence = new Date(hoje.getFullYear(), hoje.getMonth(), Math.min(das.dia, new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()));
  const dias = Math.round((vence.getTime() - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) / 864e5);
  const historico = Object.entries(das.pagos).sort((a, b) => b[0].localeCompare(a[0]));
  const ultimos = historico.slice(0, 6).map(([, p]) => p.valor);
  const media = ultimos.length ? ultimos.reduce((a, v) => a + v, 0) / ultimos.length : das.valorEstimado;
  return { mes, pago, vence, dias, atrasado: !pago && dias < 0, media, historico };
}

/** Marca o DAS do mês como pago e registra o gasto (categoria Impostos). */
export async function pagarDas(valor: number, mes = chaveMes(new Date())) {
  const perfil = await db.perfil.get('eu');
  if (!perfil?.das) return;
  const agora = new Date().toISOString();
  await db.transaction('rw', db.perfil, db.movimentos, async () => {
    await db.perfil.update('eu', { das: { ...perfil.das!, pagos: { ...perfil.das!.pagos, [mes]: { valor, em: agora } } } });
    await db.movimentos.add({
      data: agora,
      valor,
      tipo: 'saida',
      descricao: `DAS ${mes.slice(5)}/${mes.slice(0, 4)}`,
      local: 'DAS (Simples Nacional)',
      categoria: 'Impostos',
      origem: 'manual',
      forma: 'boleto',
      chave: `${chaveMovimento(agora, valor, 'das', 'saida')}-das-${mes}`,
    });
  });
}

/** Desfaz o "Paguei" (apaga o gasto registrado junto). */
export async function desfazerDas(mes: string) {
  const perfil = await db.perfil.get('eu');
  if (!perfil?.das) return;
  const { [mes]: _, ...resto } = perfil.das.pagos;
  await db.transaction('rw', db.perfil, db.movimentos, async () => {
    await db.perfil.update('eu', { das: { ...perfil.das!, pagos: resto } });
    const movs = await db.movimentos.filter((m) => m.chave.endsWith(`-das-${mes}`)).toArray();
    await db.movimentos.bulkDelete(movs.map((m) => m.id!));
  });
}

const ID_LEMBRETE = 74210;

/** Android: agenda o lembrete mensal do DAS (no dia escolhido e 3 dias antes), mesmo com o app fechado. */
export async function agendarLembretesDas(das?: Das) {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: ID_LEMBRETE }, { id: ID_LEMBRETE + 1 }] });
    if (!das) return;
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted' && (await LocalNotifications.requestPermissions()).display !== 'granted') return;
    const antes = das.dia > 3 ? das.dia - 3 : undefined;
    await LocalNotifications.schedule({
      notifications: [
        { id: ID_LEMBRETE, title: 'Hoje vence a DAS', body: 'Pague a DAS do mês e marque "Paguei" no Meus Planos.', schedule: { on: { day: das.dia, hour: 9, minute: 0 }, allowWhileIdle: true } },
        ...(antes ? [{ id: ID_LEMBRETE + 1, title: 'A DAS vence em 3 dias', body: `Vencimento no dia ${das.dia}. Gere a guia no portal do Simples Nacional.`, schedule: { on: { day: antes, hour: 9, minute: 0 }, allowWhileIdle: true } }] : []),
      ],
    });
  } catch {
    /* sem permissão: os lembretes aparecem dentro do app */
  }
}

/** Lembrete dentro do app (e notificação do navegador): 3 dias antes, no dia e em atraso. */
export async function lembrarDas() {
  const perfil = await db.perfil.get('eu');
  if (!ehPJ(perfil) || !perfil?.das) return;
  const s = situacaoDas(perfil.das);
  if (!s || s.pago) return;
  const valor = s.media ? ` (média ${reais(s.media)})` : '';
  if (s.atrasado) await avisar('DAS em atraso', `A DAS de ${s.mes.slice(5)}/${s.mes.slice(0, 4)} venceu dia ${perfil.das.dia}${valor}. Pague logo para evitar multa e juros.`, `das-atraso-${s.mes}-${new Date().toISOString().slice(0, 10)}`);
  else if (s.dias === 0) await avisar('Hoje vence a DAS', `Pague a DAS do mês${valor} e marque "Paguei" no app.`, `das-hoje-${s.mes}`);
  else if (s.dias > 0 && s.dias <= 3) await avisar(`A DAS vence em ${s.dias} ${s.dias === 1 ? 'dia' : 'dias'}`, `Vencimento no dia ${perfil.das.dia}${valor}.`, `das-antes-${s.mes}`);
}
