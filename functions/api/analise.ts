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

export interface ContaServico {
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

export async function tokenGoogle(conta: ContaServico): Promise<string> {
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

type OpcoesVertex = NonNullable<ConstructorParameters<typeof AnthropicVertex>[0]>;

/**
 * Cliente do Claude no Vertex usando o acesso que nós mesmos geramos (JWT da conta de serviço).
 * O SDK aceita um "authClient": entregamos um mínimo, que só devolve o cabeçalho Authorization,
 * assim a biblioteca do Google não precisa rodar dentro da Cloudflare.
 */
export async function clienteVertex(env: Env, conta: ContaServico, extras: Partial<OpcoesVertex> = {}) {
  const projeto = env.GCP_PROJECT_ID || conta.project_id;
  const authClient = {
    projectId: projeto,
    getRequestHeaders: async () => new Headers({ Authorization: `Bearer ${await tokenGoogle(conta)}` }),
  } as unknown as OpcoesVertex['authClient'];
  return new AnthropicVertex({ region: env.GCP_REGION || 'global', projectId: projeto, authClient, ...extras });
}

/**
 * Modelos do Claude tentados em ordem: o primeiro que o Google Cloud aceitar (ativado no
 * Model Garden e com cota) é usado. GCP_MODELO, se definido, vai na frente.
 */
export const MODELOS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-sonnet-4-6', 'claude-haiku-5-5', 'claude-3-5-sonnet-v2@20241022', 'claude-3-5-sonnet@20240620'];
export const ordemModelos = (env: Env) => [...new Set([env.GCP_MODELO?.trim(), ...MODELOS].filter((m): m is string => Boolean(m)))];
/** Modelos antigos (Claude 3.x) não aceitam "effort" e têm limite menor de resposta. */
const antigo = (m: string) => m.startsWith('claude-3');
/** Erros que significam "este modelo não está disponível aqui": tenta o próximo. */
export const indisponivel = (e: unknown) =>
  e instanceof Anthropic.NotFoundError || e instanceof Anthropic.RateLimitError || e instanceof Anthropic.PermissionDeniedError;

let modeloBom: { id: string; em: number } | undefined;

/** Pergunta curtinha para testar cada modelo (usada pela verificação automática). */
export async function testarModelo(env: Env, conta: ContaServico, modelo: string) {
  const client = await clienteVertex(env, conta, { maxRetries: 0 });
  const m = await client.messages.create({
    model: modelo,
    max_tokens: antigo(modelo) ? 64 : 2048,
    ...(antigo(modelo) ? {} : { output_config: { effort: 'low' as const } }),
    messages: [{ role: 'user', content: 'Responda só com a palavra: ok' }],
  });
  return m.content.some((b) => b.type === 'text' && /ok/i.test(b.text));
}

async function analisarCom(env: Env, conta: ContaServico, modelo: string, pergunta: string, comPesquisa: boolean) {
  // Só o Opus 5.5 tem reserva para recusas: se ele recusar, tenta de novo no Claude Opus 4.8.
  const client = await clienteVertex(env, conta, {
    maxRetries: 0,
    ...(modelo === 'claude-opus-5-5' ? { middleware: [betaRefusalFallbackMiddleware([{ model: 'claude-opus-4-8' }])] } : {}),
  });
  const fallbackState = new BetaFallbackState();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: pergunta }];
  let resposta: Anthropic.Message | undefined;
  // A pesquisa na web roda no servidor; se ela pausar, retomamos (no máximo 4 vezes).
  for (let i = 0; i < 5; i++) {
    const stream = client.messages.stream(
      {
        model: modelo,
        max_tokens: antigo(modelo) ? 8192 : 16000,
        ...(antigo(modelo) ? {} : { output_config: { effort: 'high' as const } }),
        system: SISTEMA,
        // No Vertex AI só existe a versão básica da pesquisa na web.
        ...(comPesquisa ? { tools: [{ type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: 8, user_location: { type: 'approximate' as const, country: 'BR' } }] } : {}),
        messages,
      },
      { fallbackState },
    );
    resposta = await stream.finalMessage();
    if (resposta.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: resposta.content });
  }
  return resposta;
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

  // O modelo que funcionou por último vai primeiro (por 1 hora); depois volta a tentar a ordem preferida.
  let ordem = ordemModelos(env);
  if (modeloBom && Date.now() - modeloBom.em < 3600_000) ordem = [modeloBom.id, ...ordem.filter((m) => m !== modeloBom!.id)];

  let ultimoErro: unknown;
  for (const modelo of ordem) {
    try {
      let resposta: Anthropic.Message | undefined;
      let semPesquisa = false;
      try {
        resposta = await analisarCom(env, conta, modelo, pergunta, true);
      } catch (e) {
        // Alguns modelos antigos não têm a pesquisa na web no Vertex: faz a análise sem ela.
        if (!(e instanceof Anthropic.BadRequestError) || !antigo(modelo)) throw e;
        resposta = await analisarCom(env, conta, modelo, pergunta, false);
        semPesquisa = true;
      }
      modeloBom = { id: modelo, em: Date.now() };
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
      if (semPesquisa) partes.push('\n\n_Esta análise foi feita sem pesquisa na web: confira os valores nos sites indicados._');
      return json({ texto: partes.join('').trim(), fontes: [...fontes].map(([url, titulo]) => ({ url, titulo })), geradaEm: new Date().toISOString(), modelo });
    } catch (e) {
      ultimoErro = e;
      if (indisponivel(e)) continue;
      break;
    }
  }
  const e = ultimoErro;
  if (e instanceof Anthropic.RateLimitError) return json({ erro: 'A IA está sem cota no Google Cloud agora. Tente em alguns minutos.' }, 429);
  if (e instanceof Anthropic.PermissionDeniedError) return json({ erro: 'O Google Cloud negou o acesso: confira se o Claude está ativado no Vertex AI e se a conta de serviço tem o papel "Vertex AI User".' }, 502);
  if (e instanceof Anthropic.NotFoundError) return json({ erro: 'Nenhum modelo do Claude está ativado no Model Garden do Vertex AI.' }, 502);
  if (e instanceof Anthropic.APIError) return json({ erro: `Erro da IA (${e.status}).` }, 502);
  return json({ erro: (e as Error)?.message || 'Não foi possível concluir a análise.' }, 502);
};
