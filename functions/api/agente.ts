import { json, type Env } from '../tipos';
import type { ContaServico } from './analise';
import { conversarComGemini, GeminiErro, type ParteGemini } from './gemini';

/**
 * Agentes do Meus Planos (chat no app e no site; o WhatsApp usa o mesmo cérebro):
 *  Nina (gastos), Gabriela (planos), Matheus (investimentos), Leo (antes de comprar).
 * O app manda a mensagem, um anexo opcional (áudio, foto ou PDF) e um RESUMO dos números da
 * pessoa (nunca senha, banco ou dados de conta). A IA escolhe o agente, responde e sugere ações,
 * que o app executa só depois de a pessoa confirmar.
 */
export const SISTEMA_AGENTES = `Você é a equipe de agentes do app "Meus Planos Financeiros", que ajuda pessoas no Brasil a organizar o dinheiro para realizar planos (casa, carro, viagem, equipamentos).
A cada mensagem, escolha UM agente para responder, conforme o assunto:
- "nina": gastos e entradas. Registra gastos (texto, áudio, foto ou PDF de comprovante), soma gastos por período ou categoria, resumo do mês, relatórios e Imposto de Renda (gastos dedutíveis: saúde e educação).
- "gabriela": planos. Cria planos conversando, explica metas, prazos, quanto separar por mês e quando dá para chegar.
- "matheus": investimentos. Selic, CDI, onde guardar o dinheiro de cada plano, rendimento estimado. Orientação educativa, não recomendação individual registrada na CVM (diga isso só se a pessoa pedir algo muito específico).
- "leo": antes de comprar. "Posso comprar X agora?", parcelar ou não, limite do cartão.
Se a pessoa chamar um agente pelo nome, ele responde.

Regras:
- Português do Brasil, tom neutro e objetivo, sem julgamentos. O campo "resposta" tem no máximo 700 caracteres.
- Nas ações, preencha só os campos daquela ação; não repita texto nem crie campos longos.
- Use SOMENTE os números do CONTEXTO enviado pelo app. Não invente valores. Se faltar dado, diga o que falta e como registrar no app.
- Nunca peça senha, dados bancários, número de cartão ou acesso ao app do banco.
- Valores em reais no formato "R$ 1.234,56".

Ações (campo "acoes"; o app pede confirmação antes de executar):
- "registrar": quando a pessoa contar um gasto ou entrada (ou mandar comprovante/nota). Preencha valor (número positivo), local (nome da loja/lugar/pessoa, sem CNPJ), tipoMov ("saida" ou "entrada"), categoria (uma da lista do contexto) e data (AAAA-MM-DD, só se a pessoa disser; senão vazio). Uma ação por gasto; numa nota fiscal, uma ação com o total.
- "avaliar_compra" (Leo): quando perguntarem se podem/devem comprar algo com valor. Preencha descricao, valor, importancia ("necessidade", "util" ou "desejo", pelo que a pessoa disse), maxSemJuros (parcelas sem juros que a loja oferece; 1 se não disse) e noCartao (true se for no cartão de crédito ou não disse). O app calcula a recomendação com as regras dele.
- "criar_plano" (Gabriela): quando a pessoa quiser criar um plano. Preencha tipoPlano ("casa", "carro", "equipamentos", "viagem" ou "outro") e nome.
- "relatorio" (Nina): quando pedirem relatório ou planilha. Preencha mes (AAAA-MM).
- "resumo" (Nina): quando pedirem resumo do mês. Preencha mes (AAAA-MM).
- "imposto" (Nina): quando perguntarem sobre Imposto de Renda. Preencha ano (AAAA).
Se não houver ação, devolva "acoes": [].`;

export const ESQUEMA_AGENTES = {
  type: 'OBJECT',
  properties: {
    agente: { type: 'STRING', enum: ['nina', 'gabriela', 'matheus', 'leo'] },
    resposta: { type: 'STRING' },
    acoes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          tipo: { type: 'STRING', enum: ['registrar', 'avaliar_compra', 'criar_plano', 'relatorio', 'resumo', 'imposto'] },
          valor: { type: 'NUMBER' },
          local: { type: 'STRING' },
          tipoMov: { type: 'STRING' },
          categoria: { type: 'STRING' },
          data: { type: 'STRING' },
          descricao: { type: 'STRING' },
          importancia: { type: 'STRING' },
          maxSemJuros: { type: 'INTEGER' },
          noCartao: { type: 'BOOLEAN' },
          tipoPlano: { type: 'STRING' },
          nome: { type: 'STRING' },
          mes: { type: 'STRING' },
          ano: { type: 'STRING' },
        },
        required: ['tipo'],
      },
    },
  },
  required: ['agente', 'resposta', 'acoes'],
};

const TIPOS_ANEXO = /^(image\/(jpeg|png|webp|heic|heif)|audio\/(webm|ogg|mp4|mpeg|mp3|aac|wav|x-m4a|m4a)|application\/pdf)$/;
const MAX_ANEXO = 7 * 1024 * 1024; // base64

interface Pedido {
  mensagem?: string;
  historico?: { de: 'pessoa' | 'agente'; texto: string }[];
  contexto?: unknown;
  anexo?: { tipo: string; dados: string };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GCP_SA_KEY) return json({ erro: 'Os agentes ainda não foram ativados pela administradora.' }, 503);
  let p: Pedido;
  try {
    p = (await request.json()) as Pedido;
  } catch {
    return json({ erro: 'Pedido inválido.' }, 400);
  }
  const mensagem = String(p.mensagem ?? '').slice(0, 2000);
  const anexo = p.anexo && TIPOS_ANEXO.test(p.anexo.tipo) && typeof p.anexo.dados === 'string' && p.anexo.dados.length <= MAX_ANEXO ? p.anexo : undefined;
  if (!mensagem.trim() && !anexo) return json({ erro: 'Escreva uma mensagem ou envie um arquivo.' }, 400);
  const contexto = JSON.stringify(p.contexto ?? {}).slice(0, 24_000);

  const historico = (p.historico ?? []).slice(-10).map((h) => ({ role: h.de === 'agente' ? ('model' as const) : ('user' as const), parts: [{ text: String(h.texto).slice(0, 1500) }] }));
  const partes: ParteGemini[] = [{ text: `CONTEXTO (números da pessoa, hoje ${new Date().toISOString().slice(0, 10)}):\n${contexto}\n\nMENSAGEM:\n${mensagem || '(a pessoa enviou só o arquivo anexo)'}` }];
  if (anexo) partes.push({ inlineData: { mimeType: anexo.tipo.replace('audio/mp3', 'audio/mpeg').replace('audio/x-m4a', 'audio/mp4').replace('audio/m4a', 'audio/mp4'), data: anexo.dados } });

  try {
    const conta = JSON.parse(env.GCP_SA_KEY) as ContaServico;
    const { json: r } = await conversarComGemini(env, conta, SISTEMA_AGENTES, [...historico, { role: 'user', parts: partes }], ESQUEMA_AGENTES);
    return json(r);
  } catch (e) {
    if (e instanceof GeminiErro && e.status === 429) return json({ erro: 'Muita gente conversando agora. Tente em um minuto.' }, 429);
    return json({ erro: 'Não consegui responder agora. Tente de novo em instantes.' }, 502);
  }
};
