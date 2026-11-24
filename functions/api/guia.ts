import { excedeu } from '../auth';
import { json, quemEsta, type Env } from '../tipos';
import type { ContaServico } from './analise';
import { analisarComGemini, GeminiErro } from './gemini';

/**
 * Guia do plano (Gui): pesquisa na internet, em fontes confiáveis, tudo o que ajuda a realizar o plano
 * antes de gastar: na viagem, melhor época, hospedagem, passeios, comida e experiências; no carro,
 * melhor época de compra, custos e cuidados; e assim por diante.
 * Recebe só o tema do plano (destino, cidade, modelo…), nunca nome, e-mail ou dados financeiros.
 */
export const REGRAS_GUIA = `Regras de pesquisa e de resposta:
- Pesquise na internet ANTES de responder e use só fontes confiáveis: sites oficiais (governo, órgãos de turismo, prefeituras, fabricantes, Banco Central, Procon, Detran, Receita), guias e veículos reconhecidos (ex.: Lonely Planet, Guia Quatro Rodas, Folha, Estadão, G1, Exame, Quatro Rodas, Autoesporte, Reclame Aqui para reputação), e plataformas grandes (Booking, Google Voos, Decolar, Webmotors, FIPE, Zap Imóveis) para faixas de preço.
- Não invente: preços, datas e regras só com fonte. Diga que preços são aproximados e de quando é a informação. Se não achar fonte confiável, diga que não encontrou.
- Cite as fontes no texto como links em Markdown: [nome do site](https://...).
- Português do Brasil, tom neutro, prático e direto. Use títulos com "## " e listas com "- ". Sem tabelas longas.
- Valores em reais (R$) quando fizer sentido; se a fonte estiver em outra moeda, mostre a moeda e uma conversão aproximada.
- Nunca recomende golpes, atalhos ilegais ou compras sem segurança. Avise de golpes comuns quando for relevante.`;

const SECOES: Record<string, string> = {
  viagem: `## Melhor época para ir (clima, alta e baixa temporada, eventos e festas, quando fica mais barato)
## Quando comprar passagens e hospedagem (antecedência ideal e dicas de preço)
## Onde se hospedar (bairros/regiões recomendados, tipos de hospedagem e faixa de preço por noite)
## O que visitar (pontos turísticos imperdíveis, com dica de horário ou ingresso)
## O que comer (pratos típicos e onde provar, com faixa de preço)
## Experiências diferentes (coisas fora do roteiro comum)
## Documentos, saúde e segurança (passaporte, visto, vacinas, seguro viagem, regiões a evitar, golpes comuns)
## Como economizar nesta viagem`,
  casa: `## Onde procurar (bairros ou regiões que combinam com o perfil, prós e contras, faixa de preço)
## Melhor momento para alugar ou comprar
## Documentos e custos escondidos (fiador/caução ou ITBI, escritura, registro, taxas)
## Financiamento ou aluguel: dicas (CET, FGTS, programas como Minha Casa Minha Vida quando couber)
## Cuidados antes de fechar (vistoria, matrícula do imóvel, golpes comuns)
## Mudança e primeiros meses`,
  carro: `## O modelo vale a pena? (consumo, manutenção, revenda, recalls e reclamações frequentes)
## Melhor época para comprar (final de mês/ano, lançamentos, feirões)
## Custos além do preço (IPVA, seguro, revisões, documentação)
## Como negociar e comprar com segurança (laudo cautelar, consulta de débitos e gravame, golpes)
## Alternativas parecidas que podem valer mais a pena`,
  equipamentos: `## Boas opções para o uso descrito (modelos, o que observar na configuração)
## Melhor época para comprar (Black Friday, lançamentos, datas de promoção)
## Onde comprar com segurança (lojas confiáveis, reputação, como fugir de golpes)
## Garantia, assistência e cuidados
## Alternativas mais baratas (recondicionados, geração anterior)`,
  outro: `## Passo a passo para realizar
## Quanto costuma custar (com fontes)
## Melhor momento para fazer
## Dicas para economizar
## Cuidados e golpes comuns`,
};

const CAMPOS = ['destino', 'pessoas', 'dias', 'modalidade', 'imovel', 'quartos', 'uf', 'cidade', 'marca', 'modelo', 'condicao', 'ano', 'itens', 'uso', 'descricao'];

export function temaDoPlano(p: { tipo?: string; nome?: string; prazo?: string; respostas?: Record<string, unknown> }) {
  const r = p.respostas ?? {};
  const linhas = [`Tipo de plano: ${p.tipo ?? 'outro'}`, `Nome do plano: ${String(p.nome ?? '').slice(0, 80)}`];
  if (p.prazo && /^\d{4}-\d{2}$/.test(p.prazo)) linhas.push(`Quando pretende realizar: ${p.prazo}`);
  for (const c of CAMPOS) {
    const v = r[c];
    if (v === undefined || v === null || v === '') continue;
    // Itens de equipamentos: só os nomes, sem valores.
    const texto = c === 'itens' ? String(v).split('\n').map((l) => l.replace(/[\d.,]+\s*$/, '').trim()).filter(Boolean).join(', ') : String(v);
    linhas.push(`${c}: ${texto.slice(0, 300)}`);
  }
  return linhas.join('\n');
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const email = quemEsta(data);
  if (!email) return json({ erro: 'Entre com sua conta.', sessao: true }, 401);
  if (!env.GCP_SA_KEY) return json({ erro: 'O guia ainda não foi ativado pela administradora.' }, 503);
  if (await excedeu(env, `guia:${email}`, 15, 24 * 3600_000)) return json({ erro: 'Você já gerou muitos guias hoje. Tente amanhã.' }, 429);
  const p = (await request.json().catch(() => ({}))) as { tipo?: string; nome?: string; prazo?: string; respostas?: Record<string, unknown> };
  const tipo = p.tipo && SECOES[p.tipo] ? p.tipo : 'outro';
  const sistema = `Você é o Gui, o guia de planos do app "Meus Planos Financeiros" (Brasil). Monte um guia completo e confiável para a pessoa realizar o plano abaixo, antes de gastar o dinheiro.
Use exatamente estas seções, nesta ordem (pule só a que não fizer sentido):
${SECOES[tipo]}
Termine com "## Fontes consultadas" listando os links usados.
${REGRAS_GUIA}
Hoje é ${new Date().toISOString().slice(0, 10)}. Até 900 palavras.`;
  try {
    const conta = JSON.parse(env.GCP_SA_KEY) as ContaServico;
    const g = await analisarComGemini(env, conta, sistema, `Plano:\n${temaDoPlano({ ...p, tipo })}`);
    return json({ texto: g.texto, fontes: g.fontes.slice(0, 12), geradoEm: new Date().toISOString() });
  } catch (e) {
    if (e instanceof GeminiErro && e.status === 429) return json({ erro: 'Muita gente usando agora. Tente em um minuto.' }, 429);
    return json({ erro: 'Não consegui montar o guia agora. Tente de novo em instantes.' }, 502);
  }
};
