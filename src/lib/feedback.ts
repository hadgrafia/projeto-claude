import type { Movimento } from '../db';
import { ehEssencial } from './categorias';
import { chaveMes, somarMeses } from './format';

export type Status = 'manter' | 'rever' | 'cortar';

export interface Sugestao {
  categoria: string;
  status: Status;
  atual: number;
  media: number;
  limite: number;
  ganhoMensal: number;
  texto: string;
}

/**
 * Feedback do mês, em tom neutro e com números.
 * Compara cada categoria com a média dos 3 meses anteriores e com a renda.
 */
export function analisarMes(movs: Movimento[], renda: number, hoje = new Date()): Sugestao[] {
  const mes = chaveMes(hoje);
  const anteriores = [1, 2, 3].map((i) => somarMeses(mes, -i));
  const porCat = new Map<string, { atual: number; ant: number[]; qtd: number; noite: number; lojas: Set<string> }>();
  for (const m of movs) {
    if (m.tipo !== 'saida') continue;
    const k = m.data.slice(0, 7);
    const c = porCat.get(m.categoria) ?? { atual: 0, ant: [0, 0, 0], qtd: 0, noite: 0, lojas: new Set() };
    if (k === mes) {
      c.atual += m.valor;
      c.qtd++;
      const h = new Date(m.data).getHours();
      if (m.origem !== 'extrato' && (h >= 22 || h < 5)) c.noite++;
      c.lojas.add(m.descricao.toLowerCase());
    }
    const i = anteriores.indexOf(k);
    if (i >= 0) c.ant[i] += m.valor;
    porCat.set(m.categoria, c);
  }
  const totalVariavel = [...porCat.entries()].filter(([k]) => !ehEssencial(k)).reduce((a, [, v]) => a + v.atual, 0);
  const out: Sugestao[] = [];
  for (const [cat, c] of porCat) {
    if (!c.atual) continue;
    const comHistorico = c.ant.filter((v) => v > 0);
    const media = comHistorico.length ? comHistorico.reduce((a, b) => a + b, 0) / comHistorico.length : 0;
    const essencial = ehEssencial(cat);
    const partes: string[] = [`${c.qtd} ${c.qtd === 1 ? 'lançamento' : 'lançamentos'}`];
    if (c.noite >= 3) partes.push(`${c.noite} depois das 22h`);
    if (!essencial && totalVariavel) partes.push(`${Math.round((c.atual / totalVariavel) * 100)}% dos gastos variáveis`);
    if (media) partes.push(`média dos meses anteriores: R$ ${Math.round(media).toLocaleString('pt-BR')}`);

    let status: Status = 'manter';
    let limite = c.atual;
    if (essencial) {
      if (media && c.atual > media * 1.25) {
        status = 'rever';
        limite = media;
      }
    } else if (cat === 'Assinaturas' && c.lojas.size >= 3) {
      status = 'cortar';
      limite = c.atual / c.lojas.size;
      partes.push(`${c.lojas.size} serviços ativos, R$ ${Math.round(c.atual * 12).toLocaleString('pt-BR')} por ano`);
    } else if ((renda && c.atual > renda * 0.1) || (media && c.atual > media * 1.5)) {
      status = 'cortar';
      limite = Math.min(media || c.atual * 0.5, renda ? renda * 0.05 : Infinity);
    } else if (media && c.atual > media * 1.2) {
      status = 'rever';
      limite = media;
    }
    out.push({
      categoria: cat,
      status,
      atual: c.atual,
      media,
      limite,
      ganhoMensal: Math.max(0, c.atual - limite),
      texto: partes.join(' · ') + '.',
    });
  }
  const ordem: Record<Status, number> = { cortar: 0, rever: 1, manter: 2 };
  return out.sort((a, b) => ordem[a.status] - ordem[b.status] || b.ganhoMensal - a.ganhoMensal);
}
