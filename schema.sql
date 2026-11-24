-- Banco D1 dos planos em conjunto. O servidor guarda só dados CIFRADOS (blob):
-- a chave fica nos celulares dos participantes e no link de convite, nunca aqui.
CREATE TABLE IF NOT EXISTS planos (
  id TEXT PRIMARY KEY,
  blob TEXT NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS membros (
  plano_id TEXT NOT NULL,
  membro_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  blob TEXT NOT NULL,
  email TEXT,
  atualizado_em INTEGER NOT NULL,
  PRIMARY KEY (plano_id, membro_id)
);
CREATE TABLE IF NOT EXISTS convites (
  hash TEXT PRIMARY KEY,
  plano_id TEXT NOT NULL,
  criado_por TEXT NOT NULL,
  expira INTEGER NOT NULL
);
-- Quem foi liberado no Cloudflare Access e por quem (limite de convites por pessoa).
CREATE TABLE IF NOT EXISTS acessos (
  email TEXT PRIMARY KEY,
  convidado_por TEXT NOT NULL,
  em INTEGER NOT NULL
);
-- Pedidos de convite feitos pela página de apresentação (a administradora aprova ou recusa).
CREATE TABLE IF NOT EXISTS pedidos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  mensagem TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  ip_hash TEXT NOT NULL,
  criado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pedidos_status ON pedidos (status, criado_em);
-- Contas do app (e-mail + hash da senha). Só cria conta quem tem um convite pessoal.
CREATE TABLE IF NOT EXISTS contas (
  email TEXT PRIMARY KEY,
  senha TEXT NOT NULL,
  criada_em INTEGER NOT NULL,
  atualizada_em INTEGER NOT NULL
);
-- Sessões abertas (o servidor guarda só o hash do código do cookie).
CREATE TABLE IF NOT EXISTS sessoes (
  hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expira INTEGER NOT NULL,
  criada_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessoes_email ON sessoes (email);
-- Convites pessoais de uso único (criar conta) e links para criar senha nova.
-- O servidor guarda só o hash do código do link.
CREATE TABLE IF NOT EXISTS convites_conta (
  hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  tipo TEXT NOT NULL,
  criado_por TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  expira INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS convites_conta_email ON convites_conta (email);
-- Limite de tentativas de login e cadastro (contra quem tenta adivinhar senhas).
CREATE TABLE IF NOT EXISTS tentativas (
  chave TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  desde INTEGER NOT NULL
);
-- Cópia da conta (perfil, planos, gastos, investimentos), CIFRADA com a chave DADOS_CHAVE do servidor.
-- Dividida em partes para caber no limite do banco. Faz os dados voltarem em qualquer aparelho.
CREATE TABLE IF NOT EXISTS dados_conta (
  email TEXT NOT NULL,
  parte INTEGER NOT NULL,
  blob TEXT NOT NULL,
  versao INTEGER NOT NULL,
  atualizado_em INTEGER NOT NULL,
  PRIMARY KEY (email, parte)
);
-- Verificação em duas etapas (app autenticador). O segredo fica cifrado com DADOS_CHAVE;
-- dos códigos de recuperação, o servidor guarda só o hash.
CREATE TABLE IF NOT EXISTS dois_fatores (
  email TEXT PRIMARY KEY,
  segredo TEXT,
  pendente TEXT,
  recuperacao TEXT,
  ultimo_passo INTEGER NOT NULL DEFAULT 0,
  ativado_em INTEGER
);
-- Aparelhos conectados: tipo de aparelho/navegador, país aproximado e último uso
-- (nunca o IP). Uma linha por sessão; some junto com a sessão.
CREATE TABLE IF NOT EXISTS sessoes_info (
  hash TEXT PRIMARY KEY,
  aparelho TEXT NOT NULL,
  pais TEXT,
  ultimo_uso INTEGER NOT NULL
);
-- Atendimento com uma pessoa (dúvidas): um chamado por pessoa aberto por vez.
-- Nome e mensagens ficam cifrados (DADOS_CHAVE); a equipe vê só o nome, nunca o e-mail.
CREATE TABLE IF NOT EXISTS chamados (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  nome TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto',
  criado_em INTEGER NOT NULL,
  atualizado_em INTEGER NOT NULL,
  nao_lidas_equipe INTEGER NOT NULL DEFAULT 0,
  nao_lidas_pessoa INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS chamados_email ON chamados (email, status);
CREATE INDEX IF NOT EXISTS chamados_status ON chamados (status, atualizado_em);
CREATE TABLE IF NOT EXISTS mensagens_chamado (
  id TEXT PRIMARY KEY,
  chamado_id TEXT NOT NULL,
  de TEXT NOT NULL,
  texto TEXT NOT NULL,
  em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mensagens_chamado_id ON mensagens_chamado (chamado_id, em);
-- Senha escolhida junto com o pedido de convite (só o hash). Quando a administradora aprova,
-- a conta é criada com ela e a pessoa já entra com e-mail e senha (sem link por e-mail).
CREATE TABLE IF NOT EXISTS pedidos_senha (
  pedido_id TEXT PRIMARY KEY,
  senha TEXT NOT NULL
);
-- Estatística de uso (só contagens, para a administradora). Ninguém é identificado:
-- cada aparelho manda, uma vez por dia, a lista de recursos que usou; o servidor só soma
-- "quantas contas usaram tal recurso naquele dia". A marca anti-repetição é um código que muda
-- todo dia (não dá para ligar dias diferentes à mesma pessoa) e é apagada depois de 2 dias.
CREATE TABLE IF NOT EXISTS uso_agregado (
  dia TEXT NOT NULL,
  recurso TEXT NOT NULL,
  contas INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, recurso)
);
CREATE TABLE IF NOT EXISTS uso_marcas (
  dia TEXT NOT NULL,
  marca TEXT NOT NULL,
  recurso TEXT NOT NULL,
  PRIMARY KEY (dia, marca, recurso)
);
