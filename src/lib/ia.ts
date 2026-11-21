
/**
 * Análise aprimorada com IA. O app manda só os parâmetros do plano (sem nome,
 * banco ou extrato) para o servidor da IA, que pesquisa preços e taxas atuais.
 * Precisa de internet; o resultado fica salvo no aparelho para ler offline.
 * Fica no mesmo endereço do app (/api/analise), só para quem entrou com a conta.
 */
export interface RespostaIA {
  texto: string;
  fontes: { url: string; titulo: string }[];
  geradaEm: string;
}

export async function pedirAnalise(tipo: string, dados: Record<string, unknown>): Promise<RespostaIA> {
  if (!navigator.onLine) throw new Error('Sem internet. A análise com IA precisa de conexão; o resto do app funciona normalmente.');
  let r: Response;
  try {
    r = await fetch('/api/analise', {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, dados }),
    });
  } catch {
    throw new Error('Não foi possível falar com o servidor. Confira a internet e tente de novo.');
  }
  if (r.type === 'opaqueredirect' || r.status === 401) throw new Error('Sua sessão expirou. Abra Ajustes e toque em "Entrar de novo".');
  const corpo = (await r.json().catch(() => ({}))) as Partial<RespostaIA> & { erro?: string };
  if (!r.ok) throw new Error(corpo.erro ?? `Erro ${r.status}`);
  return { texto: corpo.texto ?? '', fontes: corpo.fontes ?? [], geradaEm: corpo.geradaEm ?? new Date().toISOString() };
}
