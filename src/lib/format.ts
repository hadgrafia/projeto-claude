const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlInteiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const reais = (v: number) => brl.format(Number.isFinite(v) ? v : 0);
export const reaisCurto = (v: number) => brlInteiro.format(Number.isFinite(v) ? Math.round(v) : 0);
export const pct = (v: number, casas = 0) =>
  `${(Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`;

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** 'AAAA-MM' do mês de uma data. */
export const chaveMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const mesCurto = (chave: string) => {
  const [a, m] = chave.split('-').map(Number);
  return `${MESES[m - 1]}/${a}`;
};
export const mesLongo = (chave: string) => {
  const [, m] = chave.split('-').map(Number);
  return MESES_LONGOS[m - 1];
};

/** Lista de chaves 'AAAA-MM' dos últimos `n` meses, terminando em `ate` (inclusive). */
export function ultimosMeses(n: number, ate = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(chaveMes(new Date(ate.getFullYear(), ate.getMonth() - i, 1)));
  return out;
}

export function somarMeses(chave: string, n: number): string {
  const [a, m] = chave.split('-').map(Number);
  return chaveMes(new Date(a, m - 1 + n, 1));
}

export function mesesEntre(de: string, ate: string): number {
  const [a1, m1] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

export const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
export const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Converte "1.234,56", "1234.56", "R$ 1.234" em número. */
export function lerValor(txt: string | number | undefined | null): number {
  if (typeof txt === 'number') return txt;
  if (!txt) return 0;
  let s = String(txt).replace(/[^\d,.-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
