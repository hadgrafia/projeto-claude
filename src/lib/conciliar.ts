import type { Movimento } from '../db';
import type { NovoMovimento } from './importar';

/**
 * Evita lançar duas vezes a mesma compra: quando o extrato do mês chega, cada linha é comparada
 * com o que já foi registrado pelos avisos do banco, pelo "Compartilhar comprovante", à mão
 * ou por um extrato anterior.
 * Mesma compra = mesmo tipo, mesmo valor (ao centavo) e data até 3 dias de diferença
 * (o banco às vezes lança no extrato um ou dois dias depois). Se houver mais de uma candidata,
 * fica a de nome mais parecido e data mais próxima. Cada lançamento existente só "casa" uma vez,
 * então dois sorvetes de R$ 25 no mesmo dia continuam sendo dois.
 */
const DIA = 24 * 3600 * 1000;
export const JANELA_DIAS = 3;

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter((p) => p.length >= 3 && !['ltda', 'com', 'compra', 'pix', 'pagamento', 'cartao', 'debito', 'credito', 'enviado', 'recebido', 'para'].includes(p));

/** 0 a 1: quanto os nomes se parecem (palavras em comum). */
export function semelhancaNome(a: string, b: string) {
  const x = new Set(normalizar(a));
  const y = new Set(normalizar(b));
  if (!x.size || !y.size) return 0;
  let comum = 0;
  for (const p of x) if (y.has(p) || [...y].some((q) => q.startsWith(p) || p.startsWith(q))) comum++;
  return comum / Math.min(x.size, y.size);
}

const dia = (iso: string) => {
  const d = new Date(iso);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

export interface Conciliado<T> {
  item: T;
  /** Lançamento que já existia e é a mesma compra (se houver). */
  igual?: Movimento;
  /** true quando é exatamente a mesma linha de um extrato já enviado. */
  exato?: boolean;
}

export function conciliar<T extends NovoMovimento>(lidos: T[], existentes: Movimento[]): Conciliado<T>[] {
  const usados = new Set<number | string>();
  const porChave = new Map(existentes.map((m) => [m.chave, m]));
  const resultado: Conciliado<T>[] = lidos.map((item) => ({ item }));
  // 1º: a mesma linha de um extrato já enviado.
  for (const r of resultado) {
    const m = porChave.get(r.item.chave);
    if (m && !usados.has(m.id ?? m.chave)) {
      r.igual = m;
      r.exato = true;
      usados.add(m.id ?? m.chave);
    }
  }
  // 2º: a mesma compra registrada de outro jeito (aviso, comprovante, à mão).
  for (const r of resultado) {
    if (r.igual) continue;
    let melhor: { m: Movimento; nota: number } | undefined;
    for (const m of existentes) {
      if (usados.has(m.id ?? m.chave) || m.tipo !== r.item.tipo || Math.abs(m.valor - r.item.valor) > 0.005) continue;
      const dias = Math.abs(dia(m.data) - dia(r.item.data)) / DIA;
      if (dias > JANELA_DIAS) continue;
      const nome = semelhancaNome(`${m.local ?? ''} ${m.descricao}`, `${r.item.local ?? ''} ${r.item.descricao}`);
      const nota = nome * 2 + (JANELA_DIAS - dias) / JANELA_DIAS;
      if (!melhor || nota > melhor.nota) melhor = { m, nota };
    }
    if (melhor) {
      r.igual = melhor.m;
      usados.add(melhor.m.id ?? melhor.m.chave);
    }
  }
  return resultado;
}

/** Para um lançamento novo (aviso ou comprovante): já existe algo igual? */
export function jaRegistrado(novo: Pick<Movimento, 'valor' | 'tipo' | 'data'> & { local?: string; descricao?: string }, existentes: Movimento[]) {
  return conciliar([{ ...novo, descricao: novo.descricao ?? novo.local ?? '', categoria: '', origem: 'manual', chave: '' } as NovoMovimento], existentes)[0].igual;
}
