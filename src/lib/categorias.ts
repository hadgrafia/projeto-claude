/** Categorias e palavras-chave usadas para classificar gastos automaticamente. */
export const CATEGORIAS: { nome: string; essencial: boolean; palavras: string[] }[] = [
  { nome: 'Moradia', essencial: true, palavras: ['aluguel', 'condominio', 'iptu', 'quintoandar'] },
  { nome: 'Mercado', essencial: true, palavras: ['supermercado', 'mercado', 'carrefour', 'pao de acucar', 'assai', 'atacadao', 'hortifruti', 'sacolao', 'oxxo', 'minuto pa'] },
  { nome: 'Contas', essencial: true, palavras: ['enel', 'sabesp', 'comgas', 'vivo', 'claro', 'tim ', 'oi ', 'internet', 'energia', 'luz', 'agua', 'gas '] },
  { nome: 'Transporte', essencial: true, palavras: ['sptrans', 'metro', 'cptm', 'bilhete unico', 'top ', 'posto', 'combustivel', 'shell', 'ipiranga', 'petrobras', 'estacionamento', 'sem parar', 'conectcar'] },
  { nome: 'Saúde', essencial: true, palavras: ['farmacia', 'drogasil', 'droga raia', 'drogaria', 'pague menos', 'hospital', 'laboratorio', 'clinica', 'unimed', 'amil', 'sulamerica', 'dentista'] },
  { nome: 'Educação', essencial: true, palavras: ['curso', 'escola', 'faculdade', 'udemy', 'alura', 'livraria'] },
  { nome: 'Delivery', essencial: false, palavras: ['ifood', 'rappi', 'ze delivery', 'aiqfome', 'james'] },
  { nome: 'Apps de transporte', essencial: false, palavras: ['uber', '99app', '99 pop', '99pop', 'cabify', 'indrive'] },
  { nome: 'Restaurantes', essencial: false, palavras: ['restaurante', 'lanchonete', 'bar ', 'padaria', 'burger', 'mcdonald', 'starbucks', 'cafe', 'pizzaria', 'outback', 'subway'] },
  { nome: 'Assinaturas', essencial: false, palavras: ['netflix', 'spotify', 'prime video', 'amazon prime', 'disney', 'hbo', 'max.com', 'youtube', 'apple.com', 'icloud', 'google one', 'deezer', 'globoplay', 'paramount', 'crunchyroll', 'chatgpt', 'claude'] },
  { nome: 'Compras', essencial: false, palavras: ['shein', 'shopee', 'amazon', 'mercado livre', 'mercadolivre', 'magalu', 'aliexpress', 'renner', 'riachuelo', 'c&a', 'zara', 'americanas', 'casas bahia', 'kabum', 'temu'] },
  { nome: 'Lazer', essencial: false, palavras: ['cinema', 'ingresso', 'sympla', 'show', 'steam', 'playstation', 'xbox', 'nintendo', 'parque'] },
  { nome: 'Beleza', essencial: false, palavras: ['salao', 'barbearia', 'boticario', 'natura', 'sephora', 'manicure'] },
];

export const NOMES_CATEGORIAS = [...CATEGORIAS.map((c) => c.nome), 'Transferências', 'Outros'];

export const ehEssencial = (cat: string) => CATEGORIAS.find((c) => c.nome === cat)?.essencial ?? false;

const normalizar = (s: string) =>
  ` ${s}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ') + ' ';

export function categorizar(descricao: string, tipo: 'saida' | 'entrada'): string {
  if (tipo === 'entrada') return 'Entrada';
  const d = normalizar(descricao);
  for (const c of CATEGORIAS) if (c.palavras.some((p) => d.includes(p))) return c.nome;
  if (d.includes('pix') || d.includes('transferencia') || d.includes(' ted ')) return 'Transferências';
  return 'Outros';
}
