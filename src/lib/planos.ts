import type { TipoPlano } from '../db';
import { lerValor, reais } from './format';
import { parcelaPrice } from './finance';

/**
 * Questionários e cálculos de cada tipo de plano.
 * Valores de referência têm fonte e data; o que é estimativa está marcado como tal
 * e pode ser trocado pela pessoa nas respostas.
 */

/** `se`: o campo só aparece quando a condição vale (ex.: perguntas de compra só para quem vai comprar). */
type Se = { se?: (r: Record<string, unknown>) => boolean };
export type Campo = Se &
  (
    | { id: string; rotulo: string; tipo: 'texto'; dica?: string; padrao?: string }
    | { id: string; rotulo: string; tipo: 'dinheiro' | 'numero'; dica?: string; padrao?: number; sufixo?: string }
    | { id: string; rotulo: string; tipo: 'opcoes'; opcoes: { valor: string; rotulo: string }[]; padrao: string; dica?: string }
    | { id: string; rotulo: string; tipo: 'mes'; dica?: string }
    | { id: string; rotulo: string; tipo: 'lista'; dica?: string }
  );

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

/**
 * Referências por estado (capital), para quando a pessoa ainda não tem um imóvel em vista.
 * São ESTIMATIVAS aproximadas baseadas no Índice FipeZap (locação e venda, médias das capitais,
 * 2025–2026); o app sempre pede para trocar pelo valor do anúncio. SP usa o FipeZap set/2026.
 */
const UFS: { uf: string; nome: string; aluguelM2: number; vendaM2: number }[] = [
  { uf: 'AC', nome: 'Acre', aluguelM2: 30, vendaM2: 5000 },
  { uf: 'AL', nome: 'Alagoas', aluguelM2: 45, vendaM2: 8500 },
  { uf: 'AP', nome: 'Amapá', aluguelM2: 32, vendaM2: 5500 },
  { uf: 'AM', nome: 'Amazonas', aluguelM2: 40, vendaM2: 6500 },
  { uf: 'BA', nome: 'Bahia', aluguelM2: 42, vendaM2: 6800 },
  { uf: 'CE', nome: 'Ceará', aluguelM2: 40, vendaM2: 8000 },
  { uf: 'DF', nome: 'Distrito Federal', aluguelM2: 45, vendaM2: 9700 },
  { uf: 'ES', nome: 'Espírito Santo', aluguelM2: 50, vendaM2: 11000 },
  { uf: 'GO', nome: 'Goiás', aluguelM2: 38, vendaM2: 8000 },
  { uf: 'MA', nome: 'Maranhão', aluguelM2: 35, vendaM2: 6000 },
  { uf: 'MT', nome: 'Mato Grosso', aluguelM2: 40, vendaM2: 7000 },
  { uf: 'MS', nome: 'Mato Grosso do Sul', aluguelM2: 35, vendaM2: 6000 },
  { uf: 'MG', nome: 'Minas Gerais', aluguelM2: 45, vendaM2: 9900 },
  { uf: 'PA', nome: 'Pará', aluguelM2: 50, vendaM2: 7500 },
  { uf: 'PB', nome: 'Paraíba', aluguelM2: 38, vendaM2: 7000 },
  { uf: 'PR', nome: 'Paraná', aluguelM2: 47, vendaM2: 10500 },
  { uf: 'PE', nome: 'Pernambuco', aluguelM2: 52, vendaM2: 8000 },
  { uf: 'PI', nome: 'Piauí', aluguelM2: 32, vendaM2: 5500 },
  { uf: 'RJ', nome: 'Rio de Janeiro', aluguelM2: 55, vendaM2: 10500 },
  { uf: 'RN', nome: 'Rio Grande do Norte', aluguelM2: 35, vendaM2: 6000 },
  { uf: 'RS', nome: 'Rio Grande do Sul', aluguelM2: 38, vendaM2: 7200 },
  { uf: 'RO', nome: 'Rondônia', aluguelM2: 32, vendaM2: 5500 },
  { uf: 'RR', nome: 'Roraima', aluguelM2: 32, vendaM2: 5500 },
  { uf: 'SC', nome: 'Santa Catarina', aluguelM2: 55, vendaM2: 12000 },
  { uf: 'SP', nome: 'São Paulo', aluguelM2: 65.78, vendaM2: 11500 },
  { uf: 'SE', nome: 'Sergipe', aluguelM2: 35, vendaM2: 5700 },
  { uf: 'TO', nome: 'Tocantins', aluguelM2: 32, vendaM2: 5500 },
];
const TAMANHO_POR_TIPO: Record<string, number> = { studio: 30, '1': 45, '2': 60, '3': 85, '4': 120 };
const ehAlugar = (r: Record<string, unknown>) => txt(r, 'modalidade', r.tamanho !== undefined || r.aluguel !== undefined ? 'alugar' : '') === 'alugar';
const ehComprar = (r: Record<string, unknown>) => txt(r, 'modalidade') === 'comprar';
const ufDe = (r: Record<string, unknown>) => {
  const uf = txt(r, 'uf').toUpperCase();
  if (uf) return UFS.find((u) => u.uf === uf);
  return /s[aã]o paulo|^sp$/i.test(txt(r, 'cidade').trim()) ? UFS.find((u) => u.uf === 'SP') : undefined; // planos antigos
};

const casa: DefPlano = {
  tipo: 'casa',
  nome: 'Casa nova',
  nomePadrao: 'Casa Nova',
  campos: [
    { id: 'modalidade', rotulo: 'Você quer alugar ou comprar?', tipo: 'opcoes', padrao: '', opcoes: [{ valor: 'alugar', rotulo: 'Alugar' }, { valor: 'comprar', rotulo: 'Comprar' }] },
    { id: 'imovel', rotulo: 'Tipo de imóvel', tipo: 'opcoes', padrao: '', opcoes: [{ valor: 'studio', rotulo: 'Studio / kitnet' }, { valor: 'apartamento', rotulo: 'Apartamento' }, { valor: 'casa', rotulo: 'Casa' }] },
    { id: 'quartos', rotulo: 'Quantos quartos?', tipo: 'opcoes', padrao: '', se: (r) => txt(r, 'imovel') !== 'studio', opcoes: [{ valor: '1', rotulo: '1' }, { valor: '2', rotulo: '2' }, { valor: '3', rotulo: '3' }, { valor: '4', rotulo: '4 ou mais' }] },
    { id: 'uf', rotulo: 'Estado', tipo: 'opcoes', padrao: '', opcoes: UFS.map((u) => ({ valor: u.uf, rotulo: u.uf })), dica: 'Usado para estimar valores enquanto você não tem um imóvel em vista.' },
    { id: 'cidade', rotulo: 'Cidade e bairro (se souber)', tipo: 'texto', dica: 'Ex.: Curitiba, Batel. Usado nas buscas de imóveis.' },
    { id: 'tamanho', rotulo: 'Tamanho do imóvel (se souber)', tipo: 'numero', sufixo: 'm²', dica: 'Vazio = estimativa pelo tipo e quartos.' },
    { id: 'pessoas', rotulo: 'Quantas pessoas vão morar?', tipo: 'opcoes', padrao: '', opcoes: [{ valor: '1', rotulo: 'Só eu' }, { valor: '2', rotulo: '2' }, { valor: '3', rotulo: '3' }, { valor: '4', rotulo: '4 ou mais' }] },
    { id: 'mobiliado', rotulo: 'Mobiliado?', tipo: 'opcoes', padrao: '', se: ehAlugar, opcoes: [{ valor: 'sim', rotulo: 'Sim' }, { valor: 'nao', rotulo: 'Não' }] },
    { id: 'aluguel', rotulo: 'Já tem um imóvel em vista? Aluguel', tipo: 'dinheiro', se: ehAlugar, dica: 'Vazio = estimativa pelo estado e tamanho.' },
    { id: 'caucao', rotulo: 'Garantia do aluguel', tipo: 'opcoes', padrao: '', se: ehAlugar, opcoes: [{ valor: '0', rotulo: 'Sem caução' }, { valor: '1', rotulo: '1 aluguel' }, { valor: '3', rotulo: '3 aluguéis' }], dica: 'Sem caução = seguro-fiança, fiador ou imobiliária sem fiador.' },
    { id: 'valorImovel', rotulo: 'Já tem um imóvel em vista? Preço', tipo: 'dinheiro', se: ehComprar, dica: 'Vazio = estimativa pelo estado e tamanho.' },
    { id: 'forma', rotulo: 'Como pretende pagar?', tipo: 'opcoes', padrao: '', se: ehComprar, opcoes: [{ valor: 'financiar', rotulo: 'Financiar' }, { valor: 'avista', rotulo: 'À vista' }] },
    { id: 'entrada', rotulo: 'Entrada', tipo: 'opcoes', padrao: '', se: (r) => ehComprar(r) && txt(r, 'forma') === 'financiar', opcoes: [{ valor: '20', rotulo: '20%' }, { valor: '30', rotulo: '30%' }, { valor: '40', rotulo: '40%' }, { valor: '50', rotulo: '50%' }], dica: 'A maioria dos bancos pede pelo menos 20% de entrada.' },
    { id: 'anosFinanciamento', rotulo: 'Prazo do financiamento', tipo: 'opcoes', padrao: '', se: (r) => ehComprar(r) && txt(r, 'forma') === 'financiar', opcoes: [{ valor: '15', rotulo: '15 anos' }, { valor: '20', rotulo: '20 anos' }, { valor: '30', rotulo: '30 anos' }, { valor: '35', rotulo: '35 anos' }] },
    { id: 'jurosAno', rotulo: 'Juros do financiamento (% ao ano)', tipo: 'numero', sufixo: '% a.a.', se: (r) => ehComprar(r) && txt(r, 'forma') === 'financiar', dica: 'Vazio = 11,5% ao ano (estimativa de mercado; simule no seu banco).' },
    { id: 'condominio', rotulo: 'Condomínio + IPTU por mês', tipo: 'dinheiro', dica: 'Vazio = estimativa de R$ 15 por m² (casa sem condomínio: R$ 4 por m² de IPTU).' },
    { id: 'reserva', rotulo: 'Reserva de emergência', tipo: 'opcoes', padrao: '6', opcoes: [{ valor: '3', rotulo: '3 meses' }, { valor: '6', rotulo: '6 meses' }, { valor: '12', rotulo: '12 meses' }] },
    { id: 'transporteValor', rotulo: 'Transporte por mês', tipo: 'dinheiro', dica: 'Ônibus, metrô, app ou combustível. Vazio = R$ 250 por pessoa (estimativa).' },
    { id: 'alimentacao', rotulo: 'Alimentação por mês', tipo: 'dinheiro', dica: 'Vazio = R$ 850 por pessoa (cesta básica DIEESE + limpeza, estimativa).' },
    { id: 'contas', rotulo: 'Luz, água, internet e celular', tipo: 'dinheiro', dica: 'Vazio = R$ 300 + R$ 100 por pessoa (estimativa).' },
    { id: 'outros', rotulo: 'Saúde, lazer e imprevistos', tipo: 'dinheiro', dica: 'Vazio = R$ 500 por pessoa (estimativa).' },
    { id: 'prazo', rotulo: 'Quando quer se mudar?', tipo: 'mes' },
  ],
  calcular(r) {
    const alugar = ehAlugar(r);
    const comprar = ehComprar(r);
    const ref = ufDe(r);
    const imovel = txt(r, 'imovel', r.tamanho !== undefined ? 'studio' : '');
    const quartos = imovel === 'studio' ? 'studio' : txt(r, 'quartos');
    const m2 = num(r, 'tamanho') || TAMANHO_POR_TIPO[quartos] || 0;
    const pessoas = Math.max(1, num(r, 'pessoas', 1));
    const notas: string[] = [];
    const fontes: string[] = [];
    const vazio = { meta: 0, composicao: [], notas, fontes, links: [] };
    if (!alugar && !comprar) return { ...vazio, notas: ['Responda se você quer alugar ou comprar.'] };
    if (!m2 && !num(r, alugar ? 'aluguel' : 'valorImovel')) return { ...vazio, notas: ['Informe o tipo de imóvel e os quartos (ou o tamanho) para estimar os valores.'] };
    const lugar = [txt(r, 'cidade'), ref?.nome].filter(Boolean).join(', ') || 'sua cidade';

    // Custos do dia a dia (iguais para alugar e comprar).
    const condInformado = num(r, 'condominio');
    const cond = condInformado || m2 * (imovel === 'casa' ? 4 : 15);
    if (!condInformado) notas.push(imovel === 'casa' ? 'IPTU estimado em R$ 4 por m² ao mês. Troque pelo valor real.' : 'Condomínio + IPTU estimados em R$ 15 por m². Troque pelo valor do anúncio.');
    // Planos antigos (São Paulo) guardaram a forma de locomoção: mantém o cálculo pelas tarifas de SP.
    const antigo = txt(r, 'transporte');
    const tarifaSP = antigo === 'metro' ? REF_SP.tarifaMetro : antigo === 'onibus' ? REF_SP.tarifaOnibus : antigo === 'integracao' ? REF_SP.tarifaIntegracao : 0;
    const transporte = num(r, 'transporteValor') || (tarifaSP ? 44 * tarifaSP : 250 * pessoas);
    const alimentacao = num(r, 'alimentacao') || 850 * pessoas;
    const contas = num(r, 'contas') || 300 + 100 * pessoas;
    const outros = num(r, 'outros') || 500 * pessoas;
    if (!num(r, 'alimentacao')) fontes.push('Alimentação: referência da cesta básica DIEESE nas capitais (estimativa por pessoa)');

    const diaADia = [
      { rotulo: imovel === 'casa' ? 'IPTU (e condomínio, se houver)' : 'Condomínio + IPTU', valor: cond },
      { rotulo: 'Alimentação', valor: alimentacao },
      { rotulo: 'Transporte', valor: transporte },
      { rotulo: 'Luz, água, internet, celular', valor: contas },
      { rotulo: 'Saúde, lazer e imprevistos', valor: outros },
    ];
    const reservaMeses = num(r, 'reserva', 6);
    const linksBusca = (acao: 'alugar' | 'comprar') => {
      const q = enc(`${imovel === 'studio' ? 'studio' : imovel || 'imóvel'} ${quartos && quartos !== 'studio' ? `${quartos} quartos` : ''} ${acao} ${lugar}`.replace(/\s+/g, ' '));
      return [
        { rotulo: 'Zap Imóveis', url: `https://www.zapimoveis.com.br/${acao === 'alugar' ? 'aluguel' : 'venda'}/` },
        { rotulo: 'Viva Real', url: `https://www.vivareal.com.br/${acao === 'alugar' ? 'aluguel' : 'venda'}/` },
        { rotulo: 'QuintoAndar', url: `https://www.quintoandar.com.br/${acao === 'alugar' ? 'alugar' : 'comprar'}/imovel/brasil` },
        { rotulo: 'OLX Imóveis', url: 'https://www.olx.com.br/imoveis' },
        { rotulo: 'Buscar no Google', url: `https://www.google.com/search?q=${q}` },
      ];
    };

    if (alugar) {
      const mobiliado = txt(r, 'mobiliado') === 'sim';
      let aluguel = num(r, 'aluguel');
      if (!aluguel) {
        if (ref) {
          aluguel = m2 * ref.aluguelM2 * (mobiliado ? 1.15 : 1);
          fontes.push(ref.uf === 'SP' ? 'Índice FipeZap de locação, set/2026: R$ 65,78/m² (São Paulo)' : `Aluguel de referência em ${ref.nome}: cerca de R$ ${ref.aluguelM2}/m² (estimativa a partir do FipeZap)`);
          if (mobiliado) notas.push('Imóveis mobiliados costumam ser anunciados uns 15% acima da média (estimativa).');
        } else notas.push('Escolha o estado ou informe o aluguel de um imóvel que você viu.');
      }
      const mensal = [{ rotulo: 'Aluguel', valor: aluguel }, ...diaADia];
      const custoMensal = mensal.reduce((a, b) => a + b.valor, 0);
      const caucaoMeses = num(r, 'caucao', 0);
      const composicao = [
        { rotulo: `Reserva de ${reservaMeses} meses de custo`, valor: reservaMeses * custoMensal },
        ...(caucaoMeses ? [{ rotulo: `Caução (${caucaoMeses} ${caucaoMeses > 1 ? 'aluguéis' : 'aluguel'})`, valor: caucaoMeses * aluguel }] : []),
        mobiliado ? { rotulo: 'Enxoval e utensílios (estimativa)', valor: 1500 + 500 * pessoas } : { rotulo: 'Móveis e eletros básicos (estimativa)', valor: 5000 + 2500 * Math.max(1, Number(quartos) || 1) },
        { rotulo: 'Mudança (estimativa)', valor: mobiliado ? 500 : imovel === 'casa' ? 2000 : 1200 },
      ];
      notas.push('A lei permite caução de no máximo 3 aluguéis (Lei do Inquilinato, art. 38).');
      return { meta: aluguel ? composicao.reduce((a, b) => a + b.valor, 0) : 0, composicao, mensal, notas, fontes, links: linksBusca('alugar') };
    }

    // Comprar
    let preco = num(r, 'valorImovel');
    if (!preco) {
      if (ref && m2) {
        preco = m2 * ref.vendaM2;
        fontes.push(`Preço de venda de referência em ${ref.nome}: cerca de R$ ${ref.vendaM2.toLocaleString('pt-BR')}/m² (estimativa a partir do FipeZap)`);
      } else notas.push('Escolha o estado ou informe o preço de um imóvel que você viu.');
    }
    const financiar = txt(r, 'forma') === 'financiar';
    const entradaPct = financiar ? num(r, 'entrada', 20) : 100;
    const entrada = (preco * entradaPct) / 100;
    const itbi = preco * 0.03;
    const cartorio = preco * 0.015;
    let parcela = 0;
    const mensal = [...diaADia];
    if (financiar && preco) {
      const anos = num(r, 'anosFinanciamento', 30);
      const jurosAno = num(r, 'jurosAno') || 11.5;
      const i = Math.pow(1 + jurosAno / 100, 1 / 12) - 1;
      parcela = parcelaPrice(preco - entrada, i, anos * 12);
      mensal.unshift({ rotulo: `Parcela do financiamento (${anos} anos, ${jurosAno.toLocaleString('pt-BR')}% a.a., aprox.)`, valor: parcela });
      notas.push(`Os bancos costumam limitar a parcela a 30% da renda: para ${reais(parcela)}, a renda (sua ou somada) precisa ser de pelo menos ${reais(parcela / 0.3)}.`);
      notas.push('A parcela real muda com o sistema (SAC começa mais alta e cai; Price é fixa), seguros e TR. Simule no seu banco e no FGTS, se tiver.');
    }
    const custoMensal = mensal.reduce((a, b) => a + b.valor, 0);
    const composicao = [
      { rotulo: financiar ? `Entrada (${entradaPct}%)` : 'Preço do imóvel (à vista)', valor: entrada },
      { rotulo: 'ITBI (cerca de 3%, varia por cidade)', valor: itbi },
      { rotulo: 'Escritura e registro (cerca de 1,5%)', valor: cartorio },
      { rotulo: `Reserva de ${reservaMeses} meses de custo`, valor: reservaMeses * custoMensal },
      { rotulo: 'Móveis, eletros e mudança (estimativa)', valor: 6000 + 2500 * Math.max(1, Number(quartos) || 1) },
    ];
    notas.push('O FGTS pode ajudar na entrada ou nas parcelas, se você tiver e se o imóvel se encaixar nas regras.');
    return { meta: preco ? composicao.reduce((a, b) => a + b.valor, 0) : 0, composicao, mensal, notas, fontes, links: linksBusca('comprar') };
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
