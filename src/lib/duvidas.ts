/**
 * Perguntas frequentes de quem está começando, com respostas prontas (funcionam sem internet).
 * Se a resposta não resolver, a pessoa fala com uma pessoa da equipe pelo atendimento.
 */
export interface Duvida {
  pergunta: string;
  resposta: string;
  tema: 'Começando' | 'Conta e segurança' | 'Gastos e avisos' | 'Planos e investimentos' | 'Cartão e compras' | 'App e aparelhos';
  /** Tela do app que ajuda (rota). */
  tela?: { rota: string; nome: string };
  palavras?: string;
}

export const DUVIDAS: Duvida[] = [
  // Começando
  {
    tema: 'Começando',
    pergunta: 'O que é o Meus Planos Financeiros?',
    resposta:
      'Um app gratuito para organizar o dinheiro e realizar planos (casa, carro, viagem, equipamentos). Você informa a sua renda e os seus gastos, cria planos com meta e data, e o app mostra quanto separar por mês, onde investir e quando é possível chegar lá.',
  },
  {
    tema: 'Começando',
    pergunta: 'O app é pago? Tem alguma taxa escondida?',
    resposta: 'Não. O app é gratuito, sem anúncios e sem assinatura. Ele também nunca movimenta o seu dinheiro.',
    palavras: 'preço custo grátis gratuito pagar',
  },
  {
    tema: 'Começando',
    pergunta: 'Por onde eu começo?',
    resposta:
      '1) Confira a sua renda e o gasto mensal em Ajustes. 2) Crie o seu primeiro plano em Planos (+). 3) Registre os gastos: à mão, pelos avisos do banco (app Android) ou enviando o extrato. Em poucos dias o app já mostra onde dá para economizar.',
    tela: { rota: '/planos/novo', nome: 'Criar plano' },
    palavras: 'inicio primeiro passo como usar',
  },
  {
    tema: 'Começando',
    pergunta: 'Quem são a Nina, a Gabriela, o Matheus, o Leo, a Lari e o Gui?',
    resposta:
      'São os agentes de IA do app. Nina cuida dos gastos e da renda; Gabriela, dos planos; Matheus, dos investimentos; Leo, das compras e do cartão de crédito; Lari, das assinaturas; Gui é o guia dos planos e pesquisa em fontes confiáveis (melhor época, hospedagem, passeios, se vale a pena). Converse por texto, áudio, foto ou PDF. Nada é registrado sem você confirmar.',
    tela: { rota: '/agentes', nome: 'Agentes' },
    palavras: 'agente ia inteligencia artificial chat',
  },
  // Conta e segurança
  {
    tema: 'Conta e segurança',
    pergunta: 'Por que preciso de convite?',
    resposta:
      'O app é só para convidados, para manter a segurança de todos. Para pedir, crie o seu e-mail e senha em "Criar acesso" (na página Entrar ou na página inicial). Assim que o pedido for aprovado, é só entrar com eles: sem link e sem código.',
    palavras: 'convite cadastro criar conta',
  },
  {
    tema: 'Conta e segurança',
    pergunta: 'Esqueci a minha senha. E agora?',
    resposta: 'Fale com uma pessoa da equipe aqui no atendimento: você recebe no seu e-mail um link para criar uma senha nova. Por segurança, ninguém pede a sua senha.',
    palavras: 'senha esqueci recuperar redefinir',
  },
  {
    tema: 'Conta e segurança',
    pergunta: 'O app entra na minha conta do banco?',
    resposta:
      'Nunca. O Meus Planos não acessa o app nem a conta do seu banco e não movimenta dinheiro. Ele só lê o que você permitir: avisos de pagamento no celular, o extrato que você enviar ou o que você digitar.',
    palavras: 'banco acesso seguro senha do banco',
  },
  {
    tema: 'Conta e segurança',
    pergunta: 'Meus dados estão seguros?',
    resposta:
      'Sim. Os dados ficam no seu aparelho e numa cópia cifrada da sua conta (ninguém consegue ler). Ative em Ajustes: o bloqueio com senha e digital, e a verificação em duas etapas (um código do app autenticador além da senha). Em Ajustes você também vê os aparelhos conectados.',
    tela: { rota: '/ajustes', nome: 'Ajustes' },
    palavras: 'seguranca privacidade dados lgpd hacker',
  },
  {
    tema: 'Conta e segurança',
    pergunta: 'Como escondo os valores para mostrar o app a alguém?',
    resposta: 'Toque no olho no topo do Início, Gastos, Planos ou Investimentos. Com o olho fechado, todos os valores viram "R$ ••••". Toque de novo para mostrar.',
    palavras: 'olho esconder ocultar valores privacidade',
  },
  {
    tema: 'Conta e segurança',
    pergunta: 'Como excluo a minha conta?',
    resposta: 'Em Ajustes, no fim da página: você pode só se afastar por um tempo ou excluir tudo. A exclusão apaga a conta e todos os dados do servidor.',
    tela: { rota: '/ajustes', nome: 'Ajustes' },
    palavras: 'excluir apagar deletar sair conta',
  },
  // Gastos e avisos
  {
    tema: 'Gastos e avisos',
    pergunta: 'Como registro os meus gastos?',
    resposta:
      'De três jeitos: 1) Anote em Gastos (botão "Anotar gasto ou entrada"). 2) No app Android, permita a leitura dos avisos de pagamento: cada compra entra sozinha. 3) Envie o extrato ou a fatura (PDF, OFX ou CSV) em Gastos → enviar extrato. O app não duplica o que já foi registrado.',
    tela: { rota: '/gastos', nome: 'Gastos' },
    palavras: 'gasto registrar anotar lancar despesa',
  },
  {
    tema: 'Gastos e avisos',
    pergunta: 'O app leu um aviso que não era gasto (ex.: cotação do dólar).',
    resposta: 'Toque no lançamento e em "Não foi um gasto". O app apaga ele e os iguais, e passa a ignorar avisos desse tipo. Cotações de moedas já são ignoradas automaticamente.',
    palavras: 'dolar cotacao errado aviso notificacao',
  },
  {
    tema: 'Gastos e avisos',
    pergunta: 'Quais apps de pagamento o app lê?',
    resposta: 'Só os que você marcar em Ajustes → Apps de pagamento (seu banco, carteira do Google, Samsung Wallet etc.). Avisos de outros apps são ignorados.',
    tela: { rota: '/ajustes', nome: 'Ajustes' },
    palavras: 'apps pagamento notificacao banco carteira',
  },
  {
    tema: 'Gastos e avisos',
    pergunta: 'Uso iPhone. Consigo registrar os gastos automaticamente?',
    resposta:
      'O iPhone não deixa nenhum app ler os avisos de outros apps. Você pode compartilhar o comprovante do banco com o Meus Planos, usar o app Atalhos (veja Ajustes → Registrar gastos sozinho) ou enviar o extrato.',
    palavras: 'iphone ios apple atalhos',
  },
  // Planos e investimentos
  {
    tema: 'Planos e investimentos',
    pergunta: 'Como o app calcula quanto separar por mês?',
    resposta:
      'Ele pega a sua renda, tira o gasto típico (a média dos últimos meses) e chega no valor livre. Cada plano recebe a porcentagem do valor livre que você escolher. Com a data desejada, o app mostra se dá para chegar a tempo e quanto falta por mês.',
    tela: { rota: '/planos', nome: 'Planos' },
    palavras: 'calculo mensal porcentagem livre meta prazo',
  },
  {
    tema: 'Planos e investimentos',
    pergunta: 'Onde devo investir o dinheiro de cada plano?',
    resposta:
      'Em Investir, o app sugere opções pelo prazo do plano e pelo seu perfil, com a Selic do dia (Tesouro, CDB, cofrinhos, LCI/LCA…). É uma orientação educativa; o investimento você faz no seu banco ou corretora.',
    tela: { rota: '/investir', nome: 'Investir' },
    palavras: 'investir investimento tesouro cdb selic',
  },
  {
    tema: 'Planos e investimentos',
    pergunta: 'Posso juntar dinheiro com outra pessoa no mesmo plano?',
    resposta: 'Sim, com o plano em conjunto: convide alguém da família pelo próprio plano. Cada pessoa vê só o resumo da outra, nunca a lista de gastos.',
    palavras: 'conjunto casal familia compartilhar',
  },
  {
    tema: 'Planos e investimentos',
    pergunta: 'O que é o Guia do plano?',
    resposta:
      'Em cada plano, toque em "Montar guia": o Gui pesquisa em fontes confiáveis tudo o que ajuda antes de gastar. Na viagem: melhor época, quando comprar passagem, onde se hospedar, o que visitar e comer e experiências diferentes. No carro, na casa e nos equipamentos: melhor época de compra, custos escondidos e cuidados. Tem os links das fontes.',
    palavras: 'guia dicas viagem hospedagem turismo comida epoca',
  },
  // Cartão e compras
  {
    tema: 'Cartão e compras',
    pergunta: 'Como funciona o controle do cartão de crédito?',
    resposta:
      'Em Cartão, informe o limite e os dias de fechamento e vencimento. Cada compra no crédito (à vista ou parcelada) desconta do limite e entra na fatura certa. O app avisa em vermelho se o limite passa da sua renda e mostra quanto gastar por mês sem atrasar os planos.',
    tela: { rota: '/cartao', nome: 'Cartão' },
    palavras: 'cartao credito limite fatura parcela',
  },
  {
    tema: 'Cartão e compras',
    pergunta: 'O app pergunta se foi débito ou crédito. Por quê?',
    resposta: 'Quando o aviso do banco não diz, o app pergunta para colocar a compra no lugar certo: no crédito ela entra na fatura e desconta do limite.',
    palavras: 'debito credito pergunta forma pagamento',
  },
  {
    tema: 'Cartão e compras',
    pergunta: 'Vou fazer uma compra grande. O app ajuda?',
    resposta: 'Sim: em "Vai fazer uma compra?" informe o valor e as condições. O app olha a sua fatura, o limite e os planos e diz se vale comprar agora, à vista ou em quantas vezes.',
    tela: { rota: '/compra', nome: 'Antes de comprar' },
    palavras: 'compra comprar parcelar vale a pena',
  },
  // App e aparelhos
  {
    tema: 'App e aparelhos',
    pergunta: 'Como instalo o app no celular?',
    resposta:
      'Abra o site no Chrome (Android) ou no Safari (iPhone) e toque em "Instalar" (ou Compartilhar → Adicionar à Tela de Início). É grátis e não precisa desligar nenhuma proteção do celular.',
    palavras: 'instalar baixar apk celular play store',
  },
  {
    tema: 'App e aparelhos',
    pergunta: 'Troquei de celular. Perco os meus dados?',
    resposta: 'Não. Entre com o mesmo e-mail e senha no aparelho novo: os seus dados voltam sozinhos da cópia cifrada da sua conta.',
    palavras: 'trocar celular aparelho novo dados perder backup',
  },
  {
    tema: 'App e aparelhos',
    pergunta: 'O app funciona sem internet?',
    resposta: 'Sim, para ver e anotar. A conversa com os agentes, a análise com IA e a cópia da conta precisam de internet e se atualizam quando ela volta.',
    palavras: 'offline sem internet conexao',
  },
  {
    tema: 'App e aparelhos',
    pergunta: 'Como ligo os avisos (lembretes) no celular?',
    resposta: 'Em Ajustes → Contato e avisos, ligue "Avisos no celular" e permita as notificações quando o celular pedir.',
    tela: { rota: '/ajustes', nome: 'Ajustes' },
    palavras: 'aviso notificacao lembrete',
  },
];

export const TEMAS = [...new Set(DUVIDAS.map((d) => d.tema))];

const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca simples por palavras (sem acentos). */
export function buscarDuvidas(termo: string) {
  const palavras = sem(termo).split(/\s+/).filter((p) => p.length > 2);
  if (!palavras.length) return DUVIDAS;
  return DUVIDAS.map((d) => {
    const alvo = sem(`${d.pergunta} ${d.resposta} ${d.palavras ?? ''}`);
    return { d, pontos: palavras.filter((p) => alvo.includes(p)).length };
  })
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .map((x) => x.d);
}
