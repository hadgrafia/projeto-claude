import type { IdAgente, Situacao } from './agentes';
import type { Compra, Movimento, Perfil, Plano } from '../db';
import { lerCache, salvarCache } from '../db';
import { avisar } from './avisos';
import { limiteDisponivel } from './compras';
import { analisarMes } from './feedback';
import { mesCurto, reais } from './format';

/** Um destaque do painel dos agentes (também vira aviso no celular, se a pessoa quiser). */
export interface Destaque {
  agente: IdAgente;
  texto: string;
  link?: string;
  chave: string;
}

/** O que cada agente tem a dizer agora, calculado aqui no aparelho. */
export function destaques(d: { perfil?: Perfil; planos: Plano[]; movimentos: Movimento[]; compras: Compra[]; renda: number; selic?: number; situacoes: Map<number, Situacao> }): Destaque[] {
  const lista: Destaque[] = [];
  const hoje = new Date().toISOString().slice(0, 10);
  // Leo: cartão quase no fim.
  if (d.perfil?.limiteCartao) {
    const livre = limiteDisponivel(d.perfil.limiteCartao, d.perfil.limiteUsado, d.perfil.limiteUsadoEm, d.compras) ?? 0;
    const usado = 1 - livre / d.perfil.limiteCartao;
    if (usado >= 0.8)
      lista.push({ agente: 'leo', texto: `O cartão está com ${Math.round(usado * 100)}% do limite usado (restam ${reais(livre)}). Melhor segurar novas compras no cartão até a fatura baixar.`, link: '/compra', chave: `leo-cartao-${hoje}` });
  }
  // Gabriela: plano que não chega no prazo desejado.
  for (const p of d.planos) {
    const s = d.situacoes.get(p.id!);
    if (p.prazo && s?.previsao && s.previsao > p.prazo)
      lista.push({
        agente: 'gabriela',
        texto: `${p.nome}: com o valor de hoje, a meta chega em ${mesCurto(s.previsao)}, depois de ${mesCurto(p.prazo)}. Dá para ajustar a porcentagem ou a data no plano.`,
        link: `/planos/${p.id}`,
        chave: `gabriela-${p.id}-${s.previsao}`,
      });
  }
  // Nina: categorias acima do normal no mês.
  const cortar = analisarMes(d.movimentos, d.renda).filter((s) => s.status === 'cortar');
  if (cortar.length)
    lista.push({
      agente: 'nina',
      texto: `Este mês, ${cortar.map((c) => c.categoria).join(', ')} ${cortar.length === 1 ? 'está' : 'estão'} acima do normal. Cortando, sobram até ${reais(cortar.reduce((a, c) => a + c.ganhoMensal, 0))} por mês para os planos.`,
      link: '/feedback',
      chave: `nina-cortar-${hoje.slice(0, 7)}-${cortar.length}`,
    });
  // Matheus: Selic mudou desde a última vez.
  let vista = 0;
  try {
    vista = Number(localStorage.getItem('mp_selic_vista') ?? 0);
  } catch {
    /* sem armazenamento */
  }
  if (d.selic && vista && Math.abs(d.selic - vista) >= 0.25)
    lista.push({
      agente: 'matheus',
      texto: `A Selic foi de ${vista.toLocaleString('pt-BR')}% para ${d.selic.toLocaleString('pt-BR')}% ao ano. ${d.selic > vista ? 'Renda fixa pós-fixada (Tesouro Selic, CDB) passa a render mais.' : 'Renda fixa pós-fixada passa a render um pouco menos; vale comparar prefixados para prazos longos.'}`,
      link: '/investir',
      chave: `matheus-selic-${d.selic}`,
    });
  return lista;
}

/** Marca a Selic como vista (o aviso do Matheus só aparece quando ela muda). */
export function selicVista(selic?: number) {
  try {
    if (selic) localStorage.setItem('mp_selic_vista', String(selic));
  } catch {
    /* sem armazenamento */
  }
}

/** Avisos dos agentes no celular, se a pessoa deixou ligado. Cada um só uma vez. */
export async function avisarDestaques(perfil: Perfil | undefined, lista: Destaque[]) {
  if (perfil?.avisos?.agentes === false) return;
  const nomes: Record<IdAgente, string> = { nina: 'Nina', gabriela: 'Gabriela', matheus: 'Matheus', leo: 'Leo' };
  for (const d of lista) {
    if (await lerCache(`destaque:${d.chave}`)) continue;
    await salvarCache(`destaque:${d.chave}`, true);
    await avisar(`${nomes[d.agente]} · Meus Planos`, d.texto, d.chave);
  }
}
