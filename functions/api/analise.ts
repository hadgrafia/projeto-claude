import Anthropic, { BetaFallbackState, betaRefusalFallbackMiddleware } from '@anthropic-ai/sdk';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { json, type Env } from '../tipos';

/**
 * Análise aprimorada com IA: Claude no Google Cloud (Vertex AI), cobrado pelo Google
 * no cartão de débito ou crédito, sem conta na Anthropic. Pesquisa na web em fontes confiáveis.
 * A chave da conta de serviço fica só no servidor (segredo GCP_SA_KEY na Cloudflare).
 * O app envia APENAS os parâmetros do plano: nunca nome, banco, extrato ou lista de gastos.
 */
interface Pedido {
  tipo: 'casa' | 'carro' | 'equipamentos' | 'viagem' | 'outro' | 'investimentos';
  dados: Record<string, unknown>;
}

interface ContaServico {
  client_email: string;
  private_key: string;
  project_id: string;
}

const SISTEMA = `Você é um pesquisador de planejamento financeiro pessoal para o Brasil, dentro do app "Meus Planos Financeiros".
Seu trabalho: pesquisar na web dados atuais e confiáveis para ajudar uma pessoa a atingir um plano (morar sozinha, comprar carro, equipamentos, viagem etc.) e dizer, com números, quanto ela precisa juntar, onde guardar o dinheiro e onde comprar.

Fontes: prefira fontes oficiais e reconhecidas (Banco Central, Tesouro Direto, B3, FGC, CVM, Fipe/FipeZap, DIEESE, IBGE, prefeituras e governos, Procon, sites oficiais das lojas, bancos e montadoras, imprensa econômica). Não use fóruns nem conteúdo patrocinado como base de números. Toda afirmação com número deve vir de uma pesquisa feita agora, com a data do dado.

Investimentos: você dá orientação educativa, não recomendação personalizada registrada na CVM; diga isso uma vez, no fim, em uma frase. Respeite o prazo e o perfil: dinheiro com data marcada em até 2 anos fica em renda fixa com liquidez (Tesouro Selic, CDB/LCI/LCA de instituições cobertas pelo FGC); cripto e ações só para prazos longos e perfis que aceitam oscilação, em pequena parte. Pode citar instituições e produtos concretos, sempre com a taxa atual encontrada e a fonte, e sugerir comparar.

Segurança: nunca peça nem sugira compartilhar senhas, dados bancários ou acesso ao app do banco. Desconfie de ofertas boas demais e avise sobre golpes comuns do tipo de compra pesquisado.

Formato da resposta (português do Brasil, tom neutro e objetivo, Markdown simples):
## Resumo
3 a 5 linhas com o valor final recomendado para a meta e o aporte mensal.
## Valores pesquisados
Tabela curta: item | valor | fonte e data.
## Onde guardar o dinheiro
Até 4 opções adequadas ao prazo e ao perfil, com taxa atual e por quê.
## Onde comprar ou pesquisar
Links diretos de sites confiáveis para este plano.
## Cuidados
Até 4 itens.
Seja direto: no máximo ~600 palavras.`;

/** Mantém só campos simples e curtos: o app nunca deve mandar dados pessoais. */
function limpar(dados: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(dados).slice(0, 40)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k.slice(0, 40)] = v;
    else if (typeof v === 'boolean') out[k.slice(0, 40)] = v;
    else if (typeof v === 'string' && v.trim()) out[k.slice(0, 40)] = v.slice(0, 300);
  }
  return out;
}

/* ---------- Acesso ao Google Cloud: JWT assinado com a chave da conta de serviço ---------- */

let tokenEmCache: { valor: string; expira: number } | undefined;

const b64url = (dados: ArrayBuffer | string) =>
  btoa(typeof dados === 'string' ? dados : String.fromCharCode(...new Uint8Array(dados)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function tokenGoogle(conta: ContaServico): Promise<string> {
  if (tokenEmCache && tokenEmCache.expira > Date.now() + 60_000) return tokenEmCache.valor;
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = b64url(
    JSON.stringify({ iss: conta.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600 }),
  );
  const pem = conta.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const chave = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(`${cabecalho}.${corpo}`));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cabecalho}.${corpo}.${b64url(assinatura)}` }),
  });
  const t = (await r.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!t.access_token) throw new Error(`Google Cloud recusou o acesso: ${t.error_description ?? r.status}`);
  tokenEmCache = { valor: t.access_token, expira: Date.now() + (t.expires_in ?? 3600) * 1000 };
  return t.access_token;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GCP_SA_KEY) return json({ erro: 'A análise com IA ainda não foi ativada pela administradora.' }, 503);
  let conta: ContaServico;
  try {
    conta = JSON.parse(env.GCP_SA_KEY) as ContaServico;
  } catch {
    return json({ erro: 'Chave do Google Cloud mal configurada no servidor.' }, 500);
  }

  let pedido: Pedido;
  try {
    const texto = await request.text();
    if (texto.length > 8000) return json({ erro: 'Pedido grande demais.' }, 413);
    pedido = JSON.parse(texto) as Pedido;
  } catch {
    return json({ erro: 'Pedido inválido.' }, 400);
  }
  const tipos = ['casa', 'carro', 'equipamentos', 'viagem', 'outro', 'investimentos'];
  if (!tipos.includes(pedido.tipo)) return json({ erro: 'Tipo de plano inválido.' }, 400);

  const hoje = new Date().toISOString().slice(0, 10);
  const pergunta =
    `Data de hoje: ${hoje}.\nTipo de plano: ${pedido.tipo}.\n` +
    `Dados do plano (informados pela pessoa no app):\n${JSON.stringify(limpar(pedido.dados ?? {}), null, 2)}\n\n` +
    'Pesquise os valores atuais e monte a análise no formato pedido.';

  try {
    const client = new AnthropicVertex({
      region: env.GCP_REGION || 'global',
      projectId: env.GCP_PROJECT_ID || conta.project_id,
      accessToken: await tokenGoogle(conta),
      // No Vertex não há fallback no servidor: se o modelo recusar, tenta de novo no Claude Opus 4.8.
      middleware: [betaRefusalFallbackMiddleware([{ model: 'claude-opus-4-8' }])],
    });
    const fallbackState = new BetaFallbackState();
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: pergunta }];
    let resposta: Anthropic.Message | undefined;
    // A pesquisa na web roda no servidor; se ela pausar, retomamos (no máximo 4 vezes).
    for (let i = 0; i < 5; i++) {
      const stream = client.messages.stream(
        {
          model: 'claude-opus-5-5',
          max_tokens: 16000,
          output_config: { effort: 'high' },
          system: SISTEMA,
          // No Vertex AI só existe a versão básica da pesquisa na web.
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'BR' } }],
          messages,
        },
        { fallbackState },
      );
      resposta = await stream.finalMessage();
      if (resposta.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: resposta.content });
    }
    if (!resposta) return json({ erro: 'Sem resposta.' }, 502);
    if (resposta.stop_reason === 'refusal') return json({ erro: 'A análise não pôde ser feita para este pedido.' }, 422);

    const partes: string[] = [];
    const fontes = new Map<string, string>();
    for (const bloco of resposta.content) {
      if (bloco.type === 'text') {
        partes.push(bloco.text);
        for (const c of bloco.citations ?? []) {
          if (c.type === 'web_search_result_location') fontes.set(c.url, c.title ?? c.url);
        }
      }
    }
    return json({ texto: partes.join('').trim(), fontes: [...fontes].map(([url, titulo]) => ({ url, titulo })), geradaEm: new Date().toISOString() });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ erro: 'Muitas análises agora. Tente em alguns minutos.' }, 429);
    if (e instanceof Anthropic.PermissionDeniedError) return json({ erro: 'O Google Cloud negou o acesso: confira se o Claude está ativado no Vertex AI e se a conta de serviço tem o papel "Vertex AI User".' }, 502);
    if (e instanceof Anthropic.NotFoundError) return json({ erro: 'Modelo não encontrado no Vertex AI: ative o Claude Opus 5.5 no Model Garden.' }, 502);
    if (e instanceof Anthropic.APIError) return json({ erro: `Erro da IA (${e.status}).` }, 502);
    return json({ erro: (e as Error).message || 'Não foi possível concluir a análise.' }, 502);
  }
};
