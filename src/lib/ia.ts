import { lerCache, salvarCache } from '../db';

/**
 * Análise aprimorada com IA. O app manda só os parâmetros do plano (sem nome,
 * banco ou extrato) para o servidor da IA, que pesquisa preços e taxas atuais.
 * Precisa de internet; o resultado fica salvo no aparelho para ler offline.
 */
export interface ConfigIA {
  url: string;
  token: string;
}

export interface RespostaIA {
  texto: string;
  fontes: { url: string; titulo: string }[];
  geradaEm: string;
}

const URL_PADRAO = (import.meta.env.VITE_IA_URL as string | undefined) ?? '';

export async function lerConfigIA(): Promise<ConfigIA> {
  const c = await lerCache<ConfigIA>('config-ia');
  return { url: c?.valor.url || URL_PADRAO, token: c?.valor.token ?? '' };
}

export const salvarConfigIA = (c: ConfigIA) => salvarCache('config-ia', c);

export async function pedirAnalise(tipo: string, dados: Record<string, unknown>): Promise<RespostaIA> {
  if (!navigator.onLine) throw new Error('Sem internet. A análise com IA precisa de conexão; o resto do app funciona normalmente.');
  const cfg = await lerConfigIA();
  if (!cfg.url || !cfg.token) throw new Error('A análise com IA ainda não foi ativada. Vá em Ajustes e informe o código de acesso.');
  const r = await fetch(`${cfg.url.replace(/\/$/, '')}/analise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Token': cfg.token },
    body: JSON.stringify({ tipo, dados }),
  });
  const corpo = (await r.json().catch(() => ({}))) as Partial<RespostaIA> & { erro?: string };
  if (!r.ok) throw new Error(corpo.erro ?? `Erro ${r.status}`);
  return { texto: corpo.texto ?? '', fontes: corpo.fontes ?? [], geradaEm: corpo.geradaEm ?? new Date().toISOString() };
}
