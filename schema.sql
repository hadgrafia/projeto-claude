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
