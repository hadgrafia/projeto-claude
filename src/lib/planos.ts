import type { TipoPlano } from '../db';
import { lerValor, reais } from './format';
import { parcelaPrice } from './finance';

/**
 * Questionários e cálculos de cada tipo de plano.
 * Valores de referência têm fonte e data; o que é estimativa está marcado como tal
 * e pode ser trocado pela pessoa nas respostas.
 */

export type Campo =
  | { id: string; rotulo: string; tipo: 'texto'; dica?: string; padrao?: string }
  | { id: string; rotulo: string; tipo: 'dinheiro' | 'numero'; dica?: string; padrao?: number; sufixo?: string }
  | { id: string; rotulo: string; tipo: 'opcoes'; opcoes: { valor: string; rotulo: string }[]; padrao: string; dica?: string }
  | { id: string; rotulo: string; tipo: 'mes'; dica?: string }
  | { id: string; rotulo: string; tipo: 'lista'; dica?: string };

export interface Resultado {
  meta: number;
  composicao: { rotulo: string; valor: number }[];
  mensal?: { rotulo: string; valor: number }[];
  notas: string[];
  links: { rotulo: string; url: string }[];
  fontes: string[];
}

export interface DefPlano {
  tipo: TipoPlano;
  nome: string;
  nomePadrao: string;
  campos: Campo[];
  calcular: (r: Record<string, unknown>) => Resultado;
}

const num = (r: Record<string, unknown>, k: string, padrao = 0) => {
  const v = r[k];
  if (v === undefined || v === '' || v === null) return padrao;
  return typeof v === 'number' ? v : lerValor(String(v));
};
const txt = (r: Record<string, unknown>, k: string, padrao = '') => (r[k] === undefined || r[k] === '' ? padrao : String(r[k]));
const enc = encodeURIComponent;

/** Referências de São Paulo usadas no plano Casa Nova. */
export const REF_SP = {
  aluguelM2: 65.78, // FipeZap, setembro/2026 (preço anunciado, média da cidade)
  aluguelM2Fonte: 'Índice FipeZap de locação, set/2026: R$ 65,78/m²',
  premioMobiliado: 0.15, // estimativa
  condominioIptuM2: 18, // estimativa
  alimentacao: 1000, // cesta básica DIEESE jul/2026 R$ 915 + limpeza e higiene
  alimentacaoFonte: 'Cesta básica DIEESE em SP, jul/2026: R$ 915,01',
  tarifaMetro: 5.4,
  tarifaIntegracao: 9.38,
  tarifaOnibus: 5.3,
  tarifaFonte: 'Tarifas SPTrans e Metrô desde jan/2026 (ônibus R$ 5,30; metrô R$ 5,40; integração R$ 9,38)',
  contas: 400, // luz, água, internet e celular (faixa R$ 250–500 em reportagens de 2026)
  outros: 600, // saúde, lazer e imprevistos (estimativa)
};

const casa: DefPlano = {
  tipo: 'casa',
  nome: 'Casa nova',
  nomePadrao: 'Casa Nova',
  campos: [
    { id: 'cidade', rotulo: 'Cidade', tipo: 'texto', padrao: 'São Paulo' },
    { id: 'tamanho', rotulo: 'Tamanho do imóvel', tipo: 'numero', padrao: 30, sufixo: 'm²', dica: 'Studio costuma ter de 20 a 35 m².' },
    { id: 'mobiliado', rotulo: 'Mobiliado?', tipo: 'opcoes', padrao: 'sim', opcoes: [{ valor: 'sim', rotulo: 'Sim' }, { valor: 'nao', rotulo: 'Não' }] },
    { id: 'aluguel', rotulo: 'Já tem um imóvel em vista? Aluguel', tipo: 'dinheiro', dica: 'Deixe vazio para usar a média da cidade (só SP por enquanto).' },
    { id: 'condominio', rotulo: 'Condomínio + IPTU', tipo: 'dinheiro', dica: 'Vazio = estimativa.' },
    { id: 'reserva', rotulo: 'Reserva de emergência', tipo: 'opcoes', padrao: '6', opcoes: [{ valor: '3', rotulo: '3 meses' }, { valor: '6', rotulo: '6 meses' }, { valor: '12', rotulo: '12 meses' }] },
    { id: 'caucao', rotulo: 'Garantia do aluguel', tipo: 'opcoes', padrao: '3', opcoes: [{ valor: '0', rotulo: 'Sem caução' }, { valor: '1', rotulo: '1 aluguel' }, { valor: '3', rotulo: '3 aluguéis' }], dica: 'Sem caução = seguro-fiança ou imobiliária sem fiador.' },
    { id: 'transporte', rotulo: 'Como vai se locomover?', tipo: 'opcoes', padrao: 'integracao', opcoes: [{ valor: 'integracao', rotulo: 'Ônibus + metrô' }, { valor: 'metro', rotulo: 'Só metrô' }, { valor: 'onibus', rotulo: 'Só ônibus' }, { valor: 'outro', rotulo: 'Outro' }] },
    { id: 'transporteValor', rotulo: 'Se "Outro": gasto mensal com transporte', tipo: 'dinheiro' },
    { id: 'alimentacao', rotulo: 'Alimentação por mês', tipo: 'dinheiro', padrao: REF_SP.alimentacao },
    { id: 'contas', rotulo: 'Luz, água, internet e celular', tipo: 'dinheiro', padrao: REF_SP.contas },
    { id: 'outros', rotulo: 'Saúde, lazer e imprevistos', tipo: 'dinheiro', padrao: REF_SP.outros },
    { id: 'prazo', rotulo: 'Quando quer se mudar?', tipo: 'mes' },
  ],
  calcular(r) {
    const cidade = txt(r, 'cidade', 'São Paulo');
    const ehSP = /s[aã]o paulo|^sp$/i.test(cidade.trim());
    const m2 = num(r, 'tamanho', 30);
    const mobiliado = txt(r, 'mobiliado', 'sim') === 'sim';
    const notas: string[] = [];
    const fontes: string[] = [];
    let aluguel = num(r, 'aluguel');
    if (!aluguel) {
      if (ehSP) {
        aluguel = m2 * REF_SP.aluguelM2 * (mobiliado ? 1 + REF_SP.premioMobiliado : 1);
        fontes.push(REF_SP.aluguelM2Fonte);
        if (mobiliado) notas.push('Imóveis mobiliados costumam ser anunciados acima da média: usei +15% (estimativa).');
      } else {
        notas.push(`Ainda não tenho a média de aluguel de ${cidade}. Informe o aluguel de um imóvel que você viu.`);
      }
    }
    const cond = num(r, 'condominio') || m2 * REF_SP.condominioIptuM2;
    if (!num(r, 'condominio')) notas.push('Condomínio + IPTU estimados em R$ 18 por m². Troque pelo valor do anúncio.');
    const t = txt(r, 'transporte', 'integracao');
    const transporte =
      t === 'outro' ? num(r, 'transporteValor') : 44 * (t === 'metro' ? REF_SP.tarifaMetro : t === 'onibus' ? REF_SP.tarifaOnibus : REF_SP.tarifaIntegracao);
    if (t !== 'outro') fontes.push(REF_SP.tarifaFonte);
    const alimentacao = num(r, 'alimentacao', REF_SP.alimentacao);
    if (alimentacao === REF_SP.alimentacao) fontes.push(REF_SP.alimentacaoFonte);
    const mensal = [
      { rotulo: 'Aluguel', valor: aluguel },
      { rotulo: 'Condomínio + IPTU', valor: cond },
      { rotulo: 'Alimentação', valor: alimentacao },
      { rotulo: 'Transporte (44 viagens)', valor: transporte },
      { rotulo: 'Luz, água, internet, celular', valor: num(r, 'contas', REF_SP.contas) },
      { rotulo: 'Saúde, lazer e imprevistos', valor: num(r, 'outros', REF_SP.outros) },
    ];
    const custoMensal = mensal.reduce((a, b) => a + b.valor, 0);
    const reservaMeses = num(r, 'reserva', 6);
    const caucaoMeses = num(r, 'caucao', 3);
    const composicao = [
      { rotulo: `Reserva de ${reservaMeses} meses de custo`, valor: reservaMeses * custoMensal },
      ...(caucaoMeses ? [{ rotulo: `Caução (${caucaoMeses} ${caucaoMeses > 1 ? 'aluguéis' : 'aluguel'})`, valor: caucaoMeses * aluguel }] : []),
      mobiliado
        ? { rotulo: 'Enxoval e utensílios (estimativa)', valor: 2000 }
        : { rotulo: 'Móveis e eletros básicos (estimativa)', valor: 7500 },
      { rotulo: 'Mudança (estimativa)', valor: mobiliado ? 500 : 1200 },
    ];
    notas.push('A lei permite caução de no máximo 3 aluguéis (Lei do Inquilinato, art. 38).');
    const busca = enc(`${mobiliado ? 'mobiliado ' : ''}${cidade}`);
    return {
      meta: composicao.reduce((a, b) => a + b.valor, 0),
      composicao,
      mensal,
      notas,
      fontes,
      links: [
        { rotulo: 'QuintoAndar', url: 'https://www.quintoandar.com.br/alugar/imovel/sao-paulo-sp-brasil' },
        { rotulo: 'Zap Imóveis', url: 'https://www.zapimoveis.com.br/aluguel/apartamentos/sp+sao-paulo/' },
        { rotulo: 'Viva Real', url: 'https://www.vivareal.com.br/aluguel/sp/sao-paulo/' },
        { rotulo: 'Buscar no Google', url: `https://www.google.com/search?q=${busca}+studio+aluguel` },
      ],
    };
  },
};

const carro: DefPlano = {
  tipo: 'carro',
  nome: 'Carro',
  nomePadrao: 'Meu Carro',
  campos: [
    { id: 'marca', rotulo: 'Qual marca você deseja?', tipo: 'texto', dica: 'Ex.: Volkswagen, Fiat, Hyundai' },
    { id: 'modelo', rotulo: 'Qual modelo?', tipo: 'texto', dica: 'Ex.: Polo, Argo, HB20' },
    { id: 'condicao', rotulo: 'Novo ou usado?', tipo: 'opcoes', padrao: 'seminovo', opcoes: [{ valor: '0km', rotulo: '0 km' }, { valor: 'seminovo', rotulo: 'Seminovo' }] },
    { id: 'ano', rotulo: 'Ano do modelo', tipo: 'numero', dica: 'Para seminovos.' },
    { id: 'preco', rotulo: 'Preço do carro', tipo: 'dinheiro', dica: 'Use a consulta da Tabela FIPE no plano ou o preço de um anúncio.' },
    { id: 'pagamento', rotulo: 'À vista ou parcelado?', tipo: 'opcoes', padrao: 'avista', opcoes: [{ valor: 'avista', rotulo: 'À vista' }, { valor: 'financiado', rotulo: 'Parcelado' }] },
    { id: 'entrada', rotulo: 'Se parcelado: entrada', tipo: 'dinheiro' },
    { id: 'parcelas', rotulo: 'Em quantas vezes?', tipo: 'numero', sufixo: 'x' },
    { id: 'juros', rotulo: 'Juros ao mês da simulação do banco', tipo: 'numero', sufixo: '% a.m.', dica: 'Use o CET informado na simulação.' },
    { id: 'ipva', rotulo: 'Alíquota do IPVA', tipo: 'numero', padrao: 4, sufixo: '%', dica: 'SP: 4% para carros a gasolina/flex.' },
    { id: 'seguro', rotulo: 'Seguro por ano', tipo: 'dinheiro', dica: 'Vazio = estimativa de 5% do valor do carro.' },
    { id: 'prazo', rotulo: 'Quando pretende comprar?', tipo: 'mes' },
  ],
  calcular(r) {
    const preco = num(r, 'preco');
    const ipva = (preco * num(r, 'ipva', 4)) / 100;
    const seguro = num(r, 'seguro') || preco * 0.05;
    const docs = 1000;
    const financiado = txt(r, 'pagamento') === 'financiado';
    const entrada = num(r, 'entrada');
    const n = num(r, 'parcelas');
    const juros = num(r, 'juros') / 100;
    const notas: string[] = [];
    const composicao = financiado
      ? [{ rotulo: 'Entrada', valor: entrada }]
      : [{ rotulo: 'Carro à vista', valor: preco }];
    composicao.push(
      { rotulo: 'IPVA do 1º ano', valor: ipva },
      { rotulo: num(r, 'seguro') ? 'Seguro (1º ano)' : 'Seguro (estimativa 5%)', valor: seguro },
      { rotulo: txt(r, 'condicao') === '0km' ? 'Emplacamento e documentos (estimativa)' : 'Transferência e vistoria (estimativa)', valor: docs },
    );
    const mensal: { rotulo: string; valor: number }[] = [];
    if (financiado && preco > entrada && n > 0) {
      const p = parcelaPrice(preco - entrada, juros, n);
      mensal.push({ rotulo: `Parcela (${n}x)`, valor: p });
      notas.push(`Total pago no financiamento: ${reais(p * n + entrada)} (carro de ${reais(preco)}).`);
      if (!juros) notas.push('Informe os juros da simulação para ver a parcela real.');
    }
    mensal.push({ rotulo: 'Combustível, manutenção e estacionamento', valor: 600 });
    notas.push('Custos mensais do carro são estimativa: ajuste conforme seu uso.');
    if (!preco) notas.push('Informe o preço ou consulte a Tabela FIPE para calcular a meta.');
    const q = enc(`${txt(r, 'marca')} ${txt(r, 'modelo')}`.trim());
    return {
      meta: composicao.reduce((a, b) => a + b.valor, 0),
      composicao,
      mensal,
      notas,
      fontes: ['Tabela FIPE (preço médio de mercado), consultada no app quando houver internet'],
      links: [
        { rotulo: 'Webmotors', url: 'https://www.webmotors.com.br/carros/estoque' },
        { rotulo: 'OLX Autos', url: `https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios?q=${q}` },
        { rotulo: 'iCarros', url: 'https://www.icarros.com.br/comprar' },
        { rotulo: 'Mercado Livre', url: `https://lista.mercadolivre.com.br/veiculos/${q.replace(/%20/g, '-')}` },
        { rotulo: 'Tabela FIPE oficial', url: 'https://veiculos.fipe.org.br/' },
      ],
    };
  },
};

const equipamentos: DefPlano = {
  tipo: 'equipamentos',
  nome: 'Equipamentos',
  nomePadrao: 'Comprar Equipamentos',
  campos: [
    { id: 'itens', rotulo: 'Quais itens? Um por linha, com o valor', tipo: 'lista', dica: 'Ex.: Notebook 4500' },
    { id: 'uso', rotulo: 'Para que vai usar?', tipo: 'opcoes', padrao: 'trabalho', opcoes: [{ valor: 'trabalho', rotulo: 'Trabalho' }, { valor: 'estudo', rotulo: 'Estudo' }, { valor: 'lazer', rotulo: 'Lazer' }] },
    { id: 'prazo', rotulo: 'Quando quer comprar?', tipo: 'mes' },
  ],
  calcular(r) {
    const itens = txt(r, 'itens')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = l.match(/(.*?)[\s:–-]*(?:R\$\s?)?(\d[\d.,]*)\s*$/);
        return m ? { rotulo: m[1].trim() || l, valor: lerValor(m[2]) } : { rotulo: l, valor: 0 };
      });
    const notas = ['Pesquise o mesmo item em mais de uma loja: a diferença costuma passar de 10%.'];
    if (txt(r, 'uso') === 'trabalho') notas.push('Se você é PJ/MEI, compras para o trabalho podem ter nota fiscal no CNPJ.');
    const primeiro = enc(itens[0]?.rotulo ?? '');
    return {
      meta: itens.reduce((a, b) => a + b.valor, 0),
      composicao: itens,
      notas,
      fontes: [],
      links: [
        { rotulo: 'Buscapé (compara preços)', url: `https://www.buscape.com.br/search?q=${primeiro}` },
        { rotulo: 'Zoom (compara preços)', url: `https://www.zoom.com.br/search?q=${primeiro}` },
        { rotulo: 'Mercado Livre', url: `https://lista.mercadolivre.com.br/${primeiro.replace(/%20/g, '-')}` },
        { rotulo: 'Amazon', url: `https://www.amazon.com.br/s?k=${primeiro}` },
        { rotulo: 'KaBuM!', url: `https://www.kabum.com.br/busca/${primeiro}` },
      ],
    };
  },
};

const viagem: DefPlano = {
  tipo: 'viagem',
  nome: 'Viagem',
  nomePadrao: 'Minha Viagem',
  campos: [
    { id: 'destino', rotulo: 'Para onde?', tipo: 'texto' },
    { id: 'pessoas', rotulo: 'Quantas pessoas?', tipo: 'numero', padrao: 1 },
    { id: 'dias', rotulo: 'Quantos dias?', tipo: 'numero', padrao: 7 },
    { id: 'passagem', rotulo: 'Passagem por pessoa (ida e volta)', tipo: 'dinheiro' },
    { id: 'hospedagem', rotulo: 'Hospedagem por diária', tipo: 'dinheiro' },
    { id: 'diario', rotulo: 'Gastos por dia, por pessoa', tipo: 'dinheiro', dica: 'Comida, passeios, transporte local.' },
    { id: 'prazo', rotulo: 'Quando vai viajar?', tipo: 'mes' },
  ],
  calcular(r) {
    const p = num(r, 'pessoas', 1);
    const d = num(r, 'dias', 7);
    const base = [
      { rotulo: `Passagens (${p})`, valor: num(r, 'passagem') * p },
      { rotulo: `Hospedagem (${d} diárias)`, valor: num(r, 'hospedagem') * d },
      { rotulo: 'Gastos no destino', valor: num(r, 'diario') * d * p },
    ];
    const subtotal = base.reduce((a, b) => a + b.valor, 0);
    const composicao = [...base, { rotulo: 'Imprevistos e seguro viagem (10%)', valor: subtotal * 0.1 }];
    const dest = enc(txt(r, 'destino'));
    return {
      meta: composicao.reduce((a, b) => a + b.valor, 0),
      composicao,
      notas: ['Passagens costumam ficar mais baratas compradas com 2 a 3 meses de antecedência; acompanhe com alertas de preço.'],
      fontes: [],
      links: [
        { rotulo: 'Google Voos', url: `https://www.google.com/travel/flights?q=voos%20para%20${dest}` },
        { rotulo: 'Skyscanner', url: 'https://www.skyscanner.com.br/' },
        { rotulo: 'Booking', url: `https://www.booking.com/searchresults.pt-br.html?ss=${dest}` },
        { rotulo: 'Airbnb', url: `https://www.airbnb.com.br/s/${dest}/homes` },
      ],
    };
  },
};

const outro: DefPlano = {
  tipo: 'outro',
  nome: 'Outro',
  nomePadrao: 'Meu Plano',
  campos: [
    { id: 'descricao', rotulo: 'O que você quer conquistar?', tipo: 'texto' },
    { id: 'valor', rotulo: 'Quanto custa?', tipo: 'dinheiro' },
    { id: 'prazo', rotulo: 'Até quando?', tipo: 'mes' },
  ],
  calcular(r) {
    const v = num(r, 'valor');
    const q = enc(txt(r, 'descricao'));
    return {
      meta: v,
      composicao: [{ rotulo: txt(r, 'descricao', 'Valor do plano'), valor: v }],
      notas: [],
      fontes: [],
      links: q ? [{ rotulo: 'Pesquisar preços', url: `https://www.google.com/search?q=${q}+pre%C3%A7o` }] : [],
    };
  },
};

export const PLANOS: Record<TipoPlano, DefPlano> = { casa, carro, equipamentos, viagem, outro };

export function respostasPadrao(tipo: TipoPlano): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of PLANOS[tipo].campos) if ('padrao' in c && c.padrao !== undefined) out[c.id] = c.padrao;
  return out;
}
