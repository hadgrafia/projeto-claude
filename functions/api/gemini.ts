import type { Env } from '../tipos';
import { tokenGoogle, type ContaServico } from './analise';

/**
 * Reserva da análise com IA: o Gemini, do próprio Google, no mesmo projeto do Google Cloud
 * (mesma conta de serviço e mesmo faturamento). Só é usado quando nenhum modelo do Claude
 * tem cota. Pesquisa na web com a Busca do Google ("grounding"), com as fontes.
 */
export const GEMINI = ['gemini-3-pro', 'gemini-3-pro-preview', 'gemini-3-flash', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'];
const REGIOES = ['global', 'us-central1'];

export class GeminiErro extends Error {
  constructor(
    public status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

interface RespostaGemini {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  }[];
  error?: { code?: number; message?: string };
}

async function chamar(env: Env, conta: ContaServico, modelo: string, regiao: string, corpo: unknown) {
  const projeto = env.GCP_PROJECT_ID || conta.project_id;
  const host = regiao === 'global' ? 'aiplatform.googleapis.com' : `${regiao}-aiplatform.googleapis.com`;
  const r = await fetch(`https://${host}/v1/projects/${projeto}/locations/${regiao}/publishers/google/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await tokenGoogle(conta)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const j = (await r.json().catch(() => ({}))) as RespostaGemini;
  if (!r.ok) throw new GeminiErro(r.status, j.error?.message ?? `erro ${r.status}`);
  return j;
}

let bom: { modelo: string; regiao: string; em: number } | undefined;
const ordem = () => {
  const todas = GEMINI.flatMap((modelo) => REGIOES.map((regiao) => ({ modelo, regiao })));
  return bom && Date.now() - bom.em < 3600_000 ? [bom, ...todas.filter((t) => t.modelo !== bom!.modelo || t.regiao !== bom!.regiao)] : todas;
};
/** 404 (modelo não existe aqui), 429 (sem cota) e 403 (sem acesso a este modelo): tenta o próximo. */
const pular = (e: unknown) => e instanceof GeminiErro && [403, 404, 429].includes(e.status);

export async function analisarComGemini(env: Env, conta: ContaServico, sistema: string, pergunta: string) {
  let ultimo: unknown;
  for (const { modelo, regiao } of ordem()) {
    try {
      const j = await chamar(env, conta, modelo, regiao, {
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: 'user', parts: [{ text: pergunta }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { maxOutputTokens: 16384 },
      });
      bom = { modelo, regiao, em: Date.now() };
      const c = j.candidates?.[0];
      const texto = (c?.content?.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
      if (!texto) throw new GeminiErro(502, `resposta vazia (${c?.finishReason ?? 'sem motivo'})`);
      const fontes = new Map<string, string>();
      for (const g of c?.groundingMetadata?.groundingChunks ?? []) if (g.web?.uri) fontes.set(g.web.uri, g.web.title ?? g.web.uri);
      return { texto, fontes: [...fontes].map(([url, titulo]) => ({ url, titulo })), modelo };
    } catch (e) {
      ultimo = e;
      if (pular(e)) continue;
      throw e;
    }
  }
  throw ultimo ?? new GeminiErro(404, 'nenhum modelo Gemini disponível');
}

/** Teste curtinho (verificação automática): devolve o modelo que respondeu ou o motivo. */
export async function testarGemini(env: Env, conta: ContaServico) {
  const motivos: string[] = [];
  for (const { modelo, regiao } of ordem()) {
    try {
      const j = await chamar(env, conta, modelo, regiao, { contents: [{ role: 'user', parts: [{ text: 'Responda só com a palavra: ok' }] }], generationConfig: { maxOutputTokens: 1024 } });
      const t = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
      if (/ok/i.test(t)) return { usando: `${modelo} (${regiao})`, motivos };
      motivos.push(`${modelo}/${regiao}: resposta inesperada`);
    } catch (e) {
      const st = e instanceof GeminiErro ? e.status : 0;
      motivos.push(`${modelo}/${regiao}: ${st === 429 ? 'sem cota' : st === 404 ? 'não disponível' : st === 403 ? 'sem permissão' : `erro ${st} ${(e as Error).message.slice(0, 80)}`}`);
    }
  }
  return { usando: '', motivos };
}

export interface ParteGemini {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

/**
 * Conversa com resposta em JSON (formato fixo), usada pelos agentes. Aceita texto, áudio,
 * imagem e PDF (inlineData). Sem pesquisa na web: os números vêm do contexto do próprio app.
 */
export async function conversarComGemini(env: Env, conta: ContaServico, sistema: string, mensagens: { role: 'user' | 'model'; parts: ParteGemini[] }[], esquema: unknown) {
  let ultimo: unknown;
  for (const { modelo, regiao } of ordem()) {
    try {
      const j = await chamar(env, conta, modelo, regiao, {
        systemInstruction: { parts: [{ text: sistema }] },
        contents: mensagens,
        generationConfig: { maxOutputTokens: 8192, responseMimeType: 'application/json', responseSchema: esquema },
      });
      bom = { modelo, regiao, em: Date.now() };
      const texto = (j.candidates?.[0]?.content?.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
      return { json: JSON.parse(texto) as unknown, modelo };
    } catch (e) {
      ultimo = e;
      if (pular(e)) continue;
      throw e;
    }
  }
  throw ultimo ?? new GeminiErro(404, 'nenhum modelo Gemini disponível');
}
