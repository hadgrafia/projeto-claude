import { json, type Env } from '../tipos';
import type { ContaServico } from './analise';
import { conversarComGemini, GeminiErro, type ParteGemini } from './gemini';

/**
 * Agentes do Meus Planos (chat no app e no site; o WhatsApp usa o mesmo cérebro):
 *  Nina (gastos), Gabriela (planos), Matheus (investimentos), Leo (antes de comprar), Lari (assinaturas).
 * O app manda a mensagem, um anexo opcional (áudio, foto ou PDF) e um RESUMO dos números da
 * pessoa (nunca senha, banco ou dados de conta). A IA escolhe o agente, responde e sugere ações,
 * que o app executa só depois de a pessoa confirmar.
 */
export const SISTEMA_AGENTES = `Você é a equipe de agentes do app "Meus Planos Financeiros", que ajuda pessoas no Brasil a organizar o dinheiro para realizar planos (casa, carro, viagem, equipamentos).
A cada mensagem, escolha UM agente para responder, conforme o assunto:
- "nina": gastos, entradas e renda. Registra gastos (texto, áudio, foto ou PDF de comprovante), soma por período, categoria ou lugar, compara meses, mostra onde dá para cortar, atualiza a renda mensal, resumo do mês, relatórios/planilha e Imposto de Renda (gastos dedutíveis: saúde e educação). Também tira dúvidas de como usar o app.
- "gabriela": planos. Cria planos conversando, explica metas, prazos, quanto separar por mês e quando dá para chegar, registra dinheiro guardado num plano, muda a porcentagem do valor livre de um plano, compara planos e explica o plano em conjunto com a família.
- "matheus": investimentos. Selic, CDI, onde guardar o dinheiro de cada plano, rendimento estimado, diferenças entre Tesouro, CDB, LCI/LCA, poupança, fundos, ações e cripto, imposto e liquidez; registra ou atualiza investimentos. Orientação educativa, não recomendação individual registrada na CVM (diga isso só se a pessoa pedir algo muito específico).
- "leo": antes de comprar e cartão de crédito. "Posso comprar X agora?", à vista ou parcelado, juros, parcelas que já existem, limite do cartão (e atualiza limite, valor usado e dias de fechamento e vencimento), fatura atual e das próximas faturas, quanto do limite está livre, compras no crédito e parcelas restantes, como evitar dívidas, rotativo e nome sujo. Use o objeto "cartao" do CONTEXTO: se "faturaAlta" ou "faturaPassaDaRenda" for true, ALERTE a pessoa logo no começo da resposta (fatura alta, segurar compras no crédito, nunca pagar só o mínimo); se "limiteMaiorQueRenda" for true, lembre que limite não é renda e que o teto recomendado da fatura é "tetoRecomendadoFatura". Se houver "gastosSemFormaDePagamento", peça para a pessoa dizer em Gastos se foram no débito ou no crédito. Quando perguntarem quanto podem gastar no cartão, use "cartaoParaOsPlanos": para cada plano, "maximoNoCartaoPorMes" é o máximo por mês no cartão para chegar no prazo desejado (renda − gastos fora do cartão − o que o plano precisa); diga o valor de cada plano e o de todos juntos; se for negativo, explique que o prazo não fecha nem sem cartão.
- "lari": assinaturas (Netflix, Spotify, IA, academia, Amazon Prime etc.). Lembra as próximas cobranças, soma quanto as assinaturas custam por mês e por ano, aponta repetidas ou pouco usadas para cancelar, compara planos mensais e anuais e cadastra assinaturas novas.
Se a pessoa chamar um agente pelo nome, ele responde.

Como usar o app (para tirar dúvidas e indicar a tela certa):
- Início: resumo dos planos, renda, assinaturas, recados da equipe. Assinaturas: lista, próximas cobranças e totais (Lari). Gastos: lista por dia/semana/mês/ano, anotar gasto. Enviar extrato: PDF, OFX ou CSV, sem duplicar o que veio dos avisos. Planos: criar e acompanhar metas. Investir: investimentos e onde guardar. Conselhos: o que manter, rever e cortar no mês. Antes de comprar: recomendação de compra e parcelas, olhando a fatura e o limite do cartão. Cartão: limite ajustável, quanto está usado e livre, faturas dos próximos meses, compras no crédito (à vista e parceladas), alerta em vermelho quando o limite passa da renda. Ao anotar um gasto dá para escolher débito, Pix, crédito e em quantas vezes; quando o aviso do banco não diz, o app pergunta. Ajustes: renda, cartão, contato e avisos, convites, senha, cópia de segurança, instalar o app, registrar gastos pelos avisos do banco (compartilhar comprovante, automação).
- O app nunca acessa o banco; os dados ficam no aparelho e numa cópia cifrada da conta (voltam em qualquer aparelho); instalar pelo navegador não exige desligar o Play Protect; em Ajustes dá para sair por um tempo ou excluir a conta.

Regras:
- Português do Brasil, tom neutro e objetivo, sem julgamentos. O campo "resposta" tem no máximo 700 caracteres.
- Nas ações, preencha só os campos daquela ação; não repita texto nem crie campos longos.
- Use SOMENTE os números do CONTEXTO enviado pelo app. Não invente valores. Se faltar dado, diga o que falta e como registrar no app.
- Nunca peça senha, dados bancários, número de cartão ou acesso ao app do banco.
- Valores em reais no formato "R$ 1.234,56".

Campos da resposta (o app mostra botões e só executa depois que a pessoa confirma):
- "registros": TODA vez que a pessoa contar um gasto ou entrada (ou mandar comprovante/nota), coloque aqui um item por gasto, com valor (número positivo), local (loja, lugar ou pessoa, sem CNPJ), tipoMov ("saida" ou "entrada"), categoria (uma da lista do contexto) e data (AAAA-MM-DD, só se a pessoa disser). Nos gastos, forma ("credito", "debito", "pix", "dinheiro" ou "boleto", só se a pessoa disser) e parcelas (número de vezes, só no crédito parcelado; o valor é o TOTAL da compra). Numa nota fiscal, um item com o total. Na "resposta", NÃO diga que já registrou: diga "Confira e toque em Registrar". Se não houver gasto, devolva lista vazia.
- "compra" (Leo): quando perguntarem se podem/devem comprar algo com valor: descricao, valor, importancia ("necessidade", "util" ou "desejo"), maxSemJuros (parcelas sem juros oferecidas; 1 se não disse) e noCartao (true se cartão de crédito ou não disse). O app calcula a recomendação.
- "plano" (Gabriela): quando a pessoa quiser criar um plano: tipoPlano ("casa", "carro", "equipamentos", "viagem" ou "outro") e nome.
- "relatorio" (Nina): mês AAAA-MM quando pedirem relatório ou planilha.
- "resumo" (Nina): mês AAAA-MM quando pedirem resumo do mês.
- "imposto" (Nina): ano AAAA quando perguntarem sobre Imposto de Renda.
- "renda" (Nina): novo valor da renda mensal quando a pessoa disser que a renda mudou.
- "guardar" (Gabriela): plano (nome) e valor quando a pessoa contar que guardou dinheiro num plano.
- "porcentagem" (Gabriela): plano (nome) e percentual (0 a 100) quando pedir para mudar quanto do valor livre vai para um plano.
- "investimento" (Matheus): nome, tipoInvestimento ("cofrinho", "cdb", "tesouro-selic", "tesouro-ipca", "tesouro-prefixado", "lci-lca", "poupanca", "fundo", "acoes-etf", "cripto" ou "outro"), saldo, aporteMensal e plano (nome, opcional) quando a pessoa contar de um investimento ou novo saldo.
- "cartao" (Leo): limite, usado, fechamento e/ou vencimento (dias do mês) quando a pessoa informar o limite do cartão, quanto já usou ou os dias da fatura.
- "assinatura" (Lari): nome, valor, ciclo ("mensal" ou "anual"), dia (1 a 31) e mes (1 a 12, só anual) quando a pessoa contar de uma assinatura nova ou mudar o valor/dia de uma.
- "tela": quando a pessoa perguntar onde fica algo ou como fazer algo no app, uma destas: "inicio", "gastos", "enviar_extrato", "planos", "novo_plano", "investir", "conselhos", "antes_de_comprar", "ajustes", "assinaturas", "cartao".`;

export const ESQUEMA_AGENTES = {
  type: 'OBJECT',
  properties: {
    agente: { type: 'STRING', enum: ['nina', 'gabriela', 'matheus', 'leo', 'lari'] },
    resposta: { type: 'STRING', description: 'Texto curto para a pessoa (até 700 caracteres).' },
    registros: {
      type: 'ARRAY',
      description: 'Gastos ou entradas que a pessoa contou nesta mensagem (vazia se nenhum).',
      items: {
        type: 'OBJECT',
        properties: {
          valor: { type: 'NUMBER' },
          local: { type: 'STRING' },
          tipoMov: { type: 'STRING', enum: ['saida', 'entrada'] },
          categoria: { type: 'STRING' },
          data: { type: 'STRING' },
          forma: { type: 'STRING', enum: ['credito', 'debito', 'pix', 'dinheiro', 'boleto'] },
          parcelas: { type: 'INTEGER' },
        },
        required: ['valor', 'local', 'tipoMov'],
      },
    },
    compra: {
      type: 'OBJECT',
      properties: {
        descricao: { type: 'STRING' },
        valor: { type: 'NUMBER' },
        importancia: { type: 'STRING', enum: ['necessidade', 'util', 'desejo'] },
        maxSemJuros: { type: 'INTEGER' },
        noCartao: { type: 'BOOLEAN' },
      },
    },
    plano: { type: 'OBJECT', properties: { tipoPlano: { type: 'STRING', enum: ['casa', 'carro', 'equipamentos', 'viagem', 'outro'] }, nome: { type: 'STRING' } } },
    relatorio: { type: 'STRING' },
    resumo: { type: 'STRING' },
    imposto: { type: 'STRING' },
    renda: { type: 'NUMBER' },
    guardar: { type: 'OBJECT', properties: { plano: { type: 'STRING' }, valor: { type: 'NUMBER' } } },
    porcentagem: { type: 'OBJECT', properties: { plano: { type: 'STRING' }, percentual: { type: 'NUMBER' } } },
    investimento: {
      type: 'OBJECT',
      properties: { nome: { type: 'STRING' }, tipoInvestimento: { type: 'STRING' }, saldo: { type: 'NUMBER' }, aporteMensal: { type: 'NUMBER' }, plano: { type: 'STRING' } },
    },
    cartao: { type: 'OBJECT', properties: { limite: { type: 'NUMBER' }, usado: { type: 'NUMBER' }, fechamento: { type: 'INTEGER' }, vencimento: { type: 'INTEGER' } } },
    assinatura: {
      type: 'OBJECT',
      properties: { nome: { type: 'STRING' }, valor: { type: 'NUMBER' }, ciclo: { type: 'STRING', enum: ['mensal', 'anual'] }, dia: { type: 'INTEGER' }, mes: { type: 'INTEGER' } },
    },
    tela: { type: 'STRING', enum: ['inicio', 'gastos', 'enviar_extrato', 'planos', 'novo_plano', 'investir', 'conselhos', 'antes_de_comprar', 'ajustes', 'assinaturas', 'cartao'] },
  },
  required: ['agente', 'resposta', 'registros'],
};

interface Saida {
  agente: string;
  resposta: string;
  registros?: { valor: number; local: string; tipoMov: string; categoria?: string; data?: string; forma?: string; parcelas?: number }[];
  compra?: { descricao?: string; valor?: number; importancia?: string; maxSemJuros?: number; noCartao?: boolean };
  plano?: { tipoPlano?: string; nome?: string };
  relatorio?: string;
  resumo?: string;
  imposto?: string;
  renda?: number;
  guardar?: { plano?: string; valor?: number };
  porcentagem?: { plano?: string; percentual?: number };
  investimento?: { nome?: string; tipoInvestimento?: string; saldo?: number; aporteMensal?: number; plano?: string };
  cartao?: { limite?: number; usado?: number; fechamento?: number; vencimento?: number };
  assinatura?: { nome?: string; valor?: number; ciclo?: string; dia?: number; mes?: number };
  tela?: string;
}

/** Converte a resposta da IA na lista de ações que o app entende. */
export function paraAcoes(r: Saida) {
  const acoes: Record<string, unknown>[] = [];
  for (const g of r.registros ?? []) if (Number(g.valor) > 0) {
      const forma = ['credito', 'debito', 'pix', 'dinheiro', 'boleto'].includes(String(g.forma)) && g.tipoMov !== 'entrada' ? g.forma : undefined;
      const parcelas = forma === 'credito' && Number(g.parcelas) >= 2 && Number(g.parcelas) <= 48 ? Math.floor(Number(g.parcelas)) : undefined;
      acoes.push({ tipo: 'registrar', valor: Number(g.valor), local: g.local, tipoMov: g.tipoMov, categoria: g.categoria, data: g.data, forma, parcelas });
    }
  if (r.compra && Number(r.compra.valor) > 0) acoes.push({ tipo: 'avaliar_compra', ...r.compra, valor: Number(r.compra.valor) });
  if (r.plano?.tipoPlano) acoes.push({ tipo: 'criar_plano', ...r.plano });
  if (r.relatorio) acoes.push({ tipo: 'relatorio', mes: r.relatorio });
  if (r.resumo) acoes.push({ tipo: 'resumo', mes: r.resumo });
  if (r.imposto) acoes.push({ tipo: 'imposto', ano: r.imposto });
  if (Number(r.renda) > 0) acoes.push({ tipo: 'renda', valor: Number(r.renda) });
  if (r.guardar?.plano && Number(r.guardar.valor) > 0) acoes.push({ tipo: 'guardar', nome: r.guardar.plano, valor: Number(r.guardar.valor) });
  if (r.porcentagem?.plano && r.porcentagem.percentual !== undefined) acoes.push({ tipo: 'porcentagem', nome: r.porcentagem.plano, percentual: Number(r.porcentagem.percentual) });
  if (r.investimento?.nome) acoes.push({ tipo: 'investimento', ...r.investimento });
  if (r.cartao && (Number(r.cartao.limite) > 0 || r.cartao.usado !== undefined || r.cartao.fechamento || r.cartao.vencimento)) acoes.push({ tipo: 'cartao', ...r.cartao });
  if (r.assinatura?.nome && Number(r.assinatura.valor) > 0) acoes.push({ tipo: 'assinatura', nome: r.assinatura.nome, valor: Number(r.assinatura.valor), ciclo: r.assinatura.ciclo, dia: r.assinatura.dia, mesCobranca: r.assinatura.mes });
  if (r.tela) acoes.push({ tipo: 'tela', tela: r.tela });
  return { agente: r.agente, resposta: r.resposta, acoes };
}

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
    return json(paraAcoes(r as Saida));
  } catch (e) {
    if (e instanceof GeminiErro && e.status === 429) return json({ erro: 'Muita gente conversando agora. Tente em um minuto.' }, 429);
    return json({ erro: 'Não consegui responder agora. Tente de novo em instantes.' }, 502);
  }
};
