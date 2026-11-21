import Anthropic from '@anthropic-ai/sdk';
import { json, type Env } from '../tipos';

/**
 * Análise aprimorada com IA (Claude + pesquisa na web). A chave da API fica só no servidor.
 * O app envia APENAS os parâmetros do plano: nunca nome, banco, extrato ou lista de gastos.
 */
interface Pedido {
  tipo: 'casa' | 'carro' | 'equipamentos' | 'viagem' | 'outro' | 'investimentos';
  dados: Record<string, unknown>;
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

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ANTHROPIC_API_KEY) return json({ erro: 'A análise com IA ainda não foi ativada pela administradora.' }, 503);
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

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: pergunta }];

    try {
      let resposta: Anthropic.Beta.BetaMessage | undefined;
      // A pesquisa na web roda no servidor da Anthropic; se ela pausar, retomamos (no máximo 4 vezes).
      for (let i = 0; i < 5; i++) {
        const stream = client.beta.messages.stream({
          model: 'claude-opus-5-5',
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'high' },
          system: SISTEMA,
          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'BR' } }],
          messages,
        });
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
      return json({
        texto: partes.join('').trim(),
        fontes: [...fontes].map(([url, titulo]) => ({ url, titulo })),
        geradaEm: new Date().toISOString(),
      });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return json({ erro: 'Muitas análises agora. Tente em alguns minutos.' }, 429);
      if (e instanceof Anthropic.AuthenticationError) return json({ erro: 'Chave da IA inválida no servidor.' }, 500);
      if (e instanceof Anthropic.APIError) return json({ erro: `Erro da IA (${e.status}).` }, 502);
      return json({ erro: 'Não foi possível concluir a análise.' }, 502);
    }
};
