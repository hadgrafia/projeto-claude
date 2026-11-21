// Configura a Cloudflare para o Meus Planos (roda no GitHub Actions, a cada publicação).
// Idempotente: cria só o que ainda não existe.
//  1. confere o token
//  2. banco D1 + tabelas
//  3. projeto do Cloudflare Pages
//  4. Cloudflare Access: só protege as versões de teste (o app usa a conta com convite pessoal)
// Saídas (para os próximos passos do workflow): d1_id, grupo_id.
import { appendFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';

const TOKEN = process.env.CLOUDFLARE_API_TOKEN?.trim();
const CONTA = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const ADMIN = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const PROJETO = 'meus-planos-financeiros';
const BANCO = 'meus-planos';
const DOMINIO = `${PROJETO}.pages.dev`;

function parar(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}
if (!TOKEN) parar('Falta o segredo CLOUDFLARE_API_TOKEN no GitHub (Settings → Secrets and variables → Actions).');
if (/\s/.test(TOKEN) || /^bearer/i.test(TOKEN)) parar('O CLOUDFLARE_API_TOKEN tem espaços ou "Bearer". Cole só o código do token.');
if (!/^[A-Za-z0-9_-]{30,}$/.test(TOKEN))
  parar(`O CLOUDFLARE_API_TOKEN não parece um API Token (tem ${TOKEN.length} caracteres e caracteres inesperados). Use o código mostrado depois de "Create Token", não a Global API Key nem o Token ID.`);
if (!CONTA) parar('Falta CLOUDFLARE_ACCOUNT_ID.');
if (!ADMIN || !ADMIN.includes('@')) parar('Falta o segredo ADMIN_EMAIL no GitHub (o seu e-mail, que poderá abrir o app).');

async function cf(caminho, init = {}) {
  let r;
  try {
    r = await fetch(`https://api.cloudflare.com/client/v4${caminho}`, {
      ...init,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch (e) {
    parar(`Sem conexão com a Cloudflare (${e.cause?.code ?? e.message}). Rode o workflow de novo em alguns minutos.`);
  }
  const corpo = await r.json().catch(() => ({}));
  return { ok: r.ok && corpo.success !== false, status: r.status, ...corpo };
}
const exigir = (r, oque) => {
  if (!r.ok) parar(`${oque}: ${JSON.stringify(r.errors ?? r.status)}`);
  return r.result;
};
const saida = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);

// 1. Token
const v = await cf('/user/tokens/verify');
if (!v.ok) parar(`A Cloudflare recusou o token: ${JSON.stringify(v.errors)}. Crie um novo em My Profile → API Tokens → Create Custom Token.`);
console.log('✅ Token válido');

// 2. D1
let banco = (exigir(await cf(`/accounts/${CONTA}/d1/database?name=${BANCO}`), 'Listar bancos D1 (permissão D1: Edit?)') ?? []).find((b) => b.name === BANCO);
if (!banco) banco = exigir(await cf(`/accounts/${CONTA}/d1/database`, { method: 'POST', body: JSON.stringify({ name: BANCO }) }), 'Criar banco D1');
const d1 = banco.uuid;
const comandos = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);
for (const sql of comandos) exigir(await cf(`/accounts/${CONTA}/d1/database/${d1}/query`, { method: 'POST', body: JSON.stringify({ sql }) }), 'Criar tabelas');
console.log(`✅ Banco D1 pronto (${d1})`);
saida('d1_id', d1);

// 3. Pages
const projeto = await cf(`/accounts/${CONTA}/pages/projects/${PROJETO}`);
if (!projeto.ok) {
  exigir(await cf(`/accounts/${CONTA}/pages/projects`, { method: 'POST', body: JSON.stringify({ name: PROJETO, production_branch: 'main' }) }), 'Criar projeto Pages (permissão Cloudflare Pages: Edit?)');
  console.log('✅ Projeto Pages criado');
} else console.log('✅ Projeto Pages já existe');

// 4. Access
const org = await cf(`/accounts/${CONTA}/access/organizations`);
if (!org.ok || !org.result?.auth_domain)
  parar('O Zero Trust ainda não está ativado. No painel da Cloudflare, abra "Zero Trust", escolha um nome de equipe e o plano Free, e rode o workflow de novo.');

let idps = exigir(await cf(`/accounts/${CONTA}/access/identity_providers`), 'Listar formas de login');
let otp = idps.find((i) => i.type === 'onetimepin');
if (!otp) otp = exigir(await cf(`/accounts/${CONTA}/access/identity_providers`, { method: 'POST', body: JSON.stringify({ name: 'Código por e-mail', type: 'onetimepin', config: {} }) }), 'Ativar login por código no e-mail');

const NOME_GRUPO = 'Convidados Meus Planos';
let grupo = exigir(await cf(`/accounts/${CONTA}/access/groups`), 'Listar grupos do Access').find((g) => g.name === NOME_GRUPO);
if (!grupo) {
  grupo = exigir(await cf(`/accounts/${CONTA}/access/groups`, { method: 'POST', body: JSON.stringify({ name: NOME_GRUPO, include: [{ email: { email: ADMIN } }] }) }), 'Criar grupo de convidados');
} else if (!JSON.stringify(grupo.include).toLowerCase().includes(ADMIN)) {
  exigir(await cf(`/accounts/${CONTA}/access/groups/${grupo.id}`, { method: 'PUT', body: JSON.stringify({ name: NOME_GRUPO, include: [...grupo.include, { email: { email: ADMIN } }] }) }), 'Incluir a administradora');
}
saida('grupo_id', grupo.id);

const NOME_POLITICA = 'Somente convidados';
let politica = exigir(await cf(`/accounts/${CONTA}/access/policies`), 'Listar políticas').find((p) => p.name === NOME_POLITICA);
if (!politica)
  politica = exigir(
    await cf(`/accounts/${CONTA}/access/policies`, { method: 'POST', body: JSON.stringify({ name: NOME_POLITICA, decision: 'allow', include: [{ group: { id: grupo.id } }], session_duration: '720h' }) }),
    'Criar política de acesso',
  );

const apps = exigir(await cf(`/accounts/${CONTA}/access/apps`), 'Listar aplicativos do Access');
// O app e a API são protegidos pela CONTA do app (e-mail + senha, ver functions/auth.ts),
// e a conta só é criada por convite pessoal. O Access fica só nas versões de teste
// (*.meus-planos-financeiros.pages.dev), que ninguém de fora precisa abrir.
let app = apps.find((a) => a.name === 'Meus Planos Financeiros' || a.domain === DOMINIO);
const configApp = {
  name: 'Meus Planos Financeiros',
  type: 'self_hosted',
  domain: `*.${DOMINIO}`,
  self_hosted_domains: [`*.${DOMINIO}`],
  session_duration: '720h',
  allowed_idps: [otp.id],
  auto_redirect_to_identity: true,
  app_launcher_visible: false,
  policies: [{ id: politica.id, precedence: 1 }],
};
if (!app) app = exigir(await cf(`/accounts/${CONTA}/access/apps`, { method: 'POST', body: JSON.stringify(configApp) }), 'Proteger as versões de teste');
else app = exigir(await cf(`/accounts/${CONTA}/access/apps/${app.id}`, { method: 'PUT', body: JSON.stringify(configApp) }), 'Atualizar a proteção das versões de teste');
console.log(`✅ App e API: só com a conta de convidado (https://${DOMINIO}/entrar/). Versões de teste fechadas.`);

// Páginas públicas: política de privacidade (exigida pela Play Store) e verificação automática
// (que tem o próprio código secreto). Todo o resto continua exigindo login.
const NOME_PUBLICA = 'Público (sem login)';
let publica = exigir(await cf(`/accounts/${CONTA}/access/policies`), 'Listar políticas').find((p) => p.name === NOME_PUBLICA);
if (!publica)
  publica = exigir(
    await cf(`/accounts/${CONTA}/access/policies`, { method: 'POST', body: JSON.stringify({ name: NOME_PUBLICA, decision: 'bypass', include: [{ everyone: {} }] }) }),
    'Criar política pública',
  );
for (const caminho of ['api/saude', 'api/pedido-convite']) {
  const dominio = `${DOMINIO}/${caminho}`;
  const atual = apps.find((a) => a.domain === dominio);
  const cfg = { name: `Meus Planos · ${caminho}`, type: 'self_hosted', domain: dominio, self_hosted_domains: [dominio], app_launcher_visible: false, policies: [{ id: publica.id, precedence: 1 }] };
  if (!atual) exigir(await cf(`/accounts/${CONTA}/access/apps`, { method: 'POST', body: JSON.stringify(cfg) }), `Liberar ${caminho}`);
  else exigir(await cf(`/accounts/${CONTA}/access/apps/${atual.id}`, { method: 'PUT', body: JSON.stringify(cfg) }), `Atualizar ${caminho}`);
}
console.log(`✅ Página de apresentação pública: https://${DOMINIO}/ (com pedido de convite)`);


// Segredos do app na Cloudflare (só os nomes, nunca os valores).
const proj = exigir(await cf(`/accounts/${CONTA}/pages/projects/${PROJETO}`), 'Ler projeto Pages');
const vars = Object.keys(proj.deployment_configs?.production?.env_vars ?? {});
for (const nome of ['ADMIN_EMAIL', 'GCP_SA_KEY']) console.log(`${vars.includes(nome) ? '✅' : '⚠️ '} Segredo ${nome}: ${vars.includes(nome) ? 'configurado' : 'NÃO configurado'}`);
