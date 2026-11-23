import type { Perfil } from '../db';

/** Um serviço do catálogo: ícone oficial (simple-icons) ou sigla na cor da marca. */
export interface Servico {
  id: string;
  nome: string;
  categoria: 'Vídeo' | 'Música' | 'IA' | 'Nuvem e trabalho' | 'Jogos' | 'Compras e entregas' | 'Saúde e estudo' | 'Outros';
  icone?: string;
  sigla?: string;
  cor?: string;
}

export const CATEGORIAS_ASSINATURA: Servico['categoria'][] = ['Vídeo', 'Música', 'IA', 'Nuvem e trabalho', 'Jogos', 'Compras e entregas', 'Saúde e estudo', 'Outros'];

export const SERVICOS: Servico[] = [
  { id: 'netflix', nome: 'Netflix', categoria: 'Vídeo', icone: 'netflix' },
  { id: 'disneyplus', nome: 'Disney+', categoria: 'Vídeo', sigla: 'D+', cor: '#0E3C8C' },
  { id: 'max', nome: 'Max', categoria: 'Vídeo', icone: 'max' },
  { id: 'primevideo', nome: 'Prime Video', categoria: 'Vídeo', sigla: 'pv', cor: '#1A98FF' },
  { id: 'globoplay', nome: 'Globoplay', categoria: 'Vídeo', sigla: 'g', cor: '#F2392C' },
  { id: 'appletv', nome: 'Apple TV+', categoria: 'Vídeo', icone: 'appletv' },
  { id: 'paramountplus', nome: 'Paramount+', categoria: 'Vídeo', icone: 'paramountplus' },
  { id: 'crunchyroll', nome: 'Crunchyroll', categoria: 'Vídeo', icone: 'crunchyroll' },
  { id: 'youtubepremium', nome: 'YouTube Premium', categoria: 'Vídeo', icone: 'youtube' },
  { id: 'telecine', nome: 'Telecine', categoria: 'Vídeo', sigla: 'TC', cor: '#7A1FA2' },
  { id: 'spotify', nome: 'Spotify', categoria: 'Música', icone: 'spotify' },
  { id: 'applemusic', nome: 'Apple Music', categoria: 'Música', icone: 'applemusic' },
  { id: 'deezer', nome: 'Deezer', categoria: 'Música', icone: 'deezer' },
  { id: 'youtubemusic', nome: 'YouTube Music', categoria: 'Música', icone: 'youtubemusic' },
  { id: 'amazonmusic', nome: 'Amazon Music', categoria: 'Música', sigla: 'am', cor: '#25D1DA' },
  { id: 'tidal', nome: 'Tidal', categoria: 'Música', icone: 'tidal' },
  { id: 'chatgpt', nome: 'ChatGPT Plus', categoria: 'IA', sigla: 'GPT', cor: '#10A37F' },
  { id: 'claude', nome: 'Claude Pro', categoria: 'IA', icone: 'claude' },
  { id: 'gemini', nome: 'Google Gemini', categoria: 'IA', icone: 'googlegemini' },
  { id: 'perplexity', nome: 'Perplexity Pro', categoria: 'IA', icone: 'perplexity' },
  { id: 'copilot', nome: 'Microsoft Copilot', categoria: 'IA', sigla: 'Co', cor: '#0F6CBD' },
  { id: 'githubcopilot', nome: 'GitHub Copilot', categoria: 'IA', icone: 'githubcopilot' },
  { id: 'cursor', nome: 'Cursor', categoria: 'IA', icone: 'cursor' },
  { id: 'midjourney', nome: 'Midjourney', categoria: 'IA', sigla: 'MJ', cor: '#1C1E1A' },
  { id: 'mistral', nome: 'Mistral Le Chat', categoria: 'IA', icone: 'mistralai' },
  { id: 'icloud', nome: 'iCloud+', categoria: 'Nuvem e trabalho', icone: 'icloud' },
  { id: 'googleone', nome: 'Google One', categoria: 'Nuvem e trabalho', icone: 'google' },
  { id: 'microsoft365', nome: 'Microsoft 365', categoria: 'Nuvem e trabalho', sigla: '365', cor: '#D83B01' },
  { id: 'dropbox', nome: 'Dropbox', categoria: 'Nuvem e trabalho', icone: 'dropbox' },
  { id: 'notion', nome: 'Notion', categoria: 'Nuvem e trabalho', icone: 'notion' },
  { id: 'canva', nome: 'Canva', categoria: 'Nuvem e trabalho', sigla: 'C', cor: '#00C4CC' },
  { id: 'adobe', nome: 'Adobe', categoria: 'Nuvem e trabalho', sigla: 'Ad', cor: '#E2231A' },
  { id: 'linkedin', nome: 'LinkedIn Premium', categoria: 'Nuvem e trabalho', sigla: 'in', cor: '#0A66C2' },
  { id: 'gamepass', nome: 'Xbox Game Pass', categoria: 'Jogos', sigla: 'GP', cor: '#107C10' },
  { id: 'psplus', nome: 'PlayStation Plus', categoria: 'Jogos', icone: 'playstation' },
  { id: 'nintendo', nome: 'Nintendo Switch Online', categoria: 'Jogos', sigla: 'N', cor: '#E60012' },
  { id: 'applearcade', nome: 'Apple Arcade', categoria: 'Jogos', icone: 'applearcade' },
  { id: 'discord', nome: 'Discord Nitro', categoria: 'Jogos', icone: 'discord' },
  { id: 'twitch', nome: 'Twitch', categoria: 'Jogos', icone: 'twitch' },
  { id: 'amazonprime', nome: 'Amazon Prime', categoria: 'Compras e entregas', sigla: 'a', cor: '#FF9900' },
  { id: 'meli', nome: 'Meli+ (Mercado Livre)', categoria: 'Compras e entregas', sigla: 'ML', cor: '#FFE600' },
  { id: 'ifood', nome: 'iFood Clube', categoria: 'Compras e entregas', icone: 'ifood' },
  { id: 'uberone', nome: 'Uber One', categoria: 'Compras e entregas', icone: 'uber' },
  { id: 'smartfit', nome: 'Smart Fit', categoria: 'Saúde e estudo', sigla: 'SF', cor: '#FFB800' },
  { id: 'wellhub', nome: 'Wellhub (Gympass)', categoria: 'Saúde e estudo', sigla: 'W', cor: '#D8385E' },
  { id: 'duolingo', nome: 'Duolingo Super', categoria: 'Saúde e estudo', icone: 'duolingo' },
  { id: 'kindle', nome: 'Kindle Unlimited', categoria: 'Saúde e estudo', sigla: 'K', cor: '#232F3E' },
  { id: 'audible', nome: 'Audible', categoria: 'Saúde e estudo', icone: 'audible' },
  { id: 'tinder', nome: 'Tinder', categoria: 'Outros', icone: 'tinder' },
  { id: 'xpremium', nome: 'X Premium', categoria: 'Outros', icone: 'x' },
];

export interface Assinatura {
  id: string;
  /** id do catálogo, ou vazio quando a pessoa digitou o nome. */
  servico?: string;
  nome: string;
  valor: number;
  ciclo: 'mensal' | 'anual';
  /** Dia da cobrança (1 a 31). */
  dia: number;
  /** Mês da cobrança (1 a 12), só para anuais. */
  mes?: number;
}

export const servicoDe = (a: Pick<Assinatura, 'servico' | 'nome'>): Servico =>
  SERVICOS.find((s) => s.id === a.servico) ?? { id: 'outro', nome: a.nome, categoria: 'Outros', sigla: a.nome.trim().slice(0, 2), cor: '#8F4A2B' };

/** Quanto pesa por mês (anual dividido por 12). */
export const valorMensal = (a: Assinatura) => (a.ciclo === 'anual' ? a.valor / 12 : a.valor);
export const totalMensal = (lista: Assinatura[]) => lista.reduce((t, a) => t + valorMensal(a), 0);

/** Próxima data de cobrança (o dia é ajustado para o último dia em meses mais curtos). */
export function proximaCobranca(a: Assinatura, hoje = new Date()): Date {
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const naData = (ano: number, mes0: number) => new Date(ano, mes0, Math.min(a.dia, new Date(ano, mes0 + 1, 0).getDate()));
  if (a.ciclo === 'anual') {
    const m0 = (a.mes ?? 1) - 1;
    let d = naData(base.getFullYear(), m0);
    if (d < base) d = naData(base.getFullYear() + 1, m0);
    return d;
  }
  let d = naData(base.getFullYear(), base.getMonth());
  if (d < base) d = naData(base.getFullYear(), base.getMonth() + 1);
  return d;
}
export const diasAte = (d: Date, hoje = new Date()) => Math.round((d.getTime() - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) / 864e5);

export const assinaturasDe = (perfil?: Perfil) => perfil?.assinaturas ?? [];
/** Já respondeu (cadastrou assinaturas ou disse que não tem). */
export const respondeuAssinaturas = (perfil?: Perfil) => Boolean(perfil?.assinaturasRespondido || perfil?.assinaturas?.length);
