// Testa o app publicado de verdade (banco, IA no Google Cloud, convites) e mostra um relatório.
// Usa /api/saude, que exige o código VERIFICACAO gravado pelo robô de publicação.
const URL_APP = 'https://meus-planos-financeiros.pages.dev';
const codigo = process.env.VERIFICACAO;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let r;
for (let tentativa = 1; tentativa <= 8; tentativa++) {
  try {
    const resp = await fetch(`${URL_APP}/api/saude`, { headers: { 'X-Verificacao': codigo }, redirect: 'manual' });
    if (resp.status === 200) {
      r = await resp.json();
      break;
    }
    console.log(`Tentativa ${tentativa}: resposta ${resp.status}, aguardando a publicação se espalhar…`);
  } catch (e) {
    console.log(`Tentativa ${tentativa}: ${e.cause?.code ?? e.message}`);
  }
  await espera(15000);
}
if (!r) {
  console.error('❌ Não foi possível falar com o app publicado.');
  process.exit(2);
}

const rotulos = {
  banco: 'Banco do plano em conjunto',
  emailAdministradora: 'E-mail da administradora',
  exigeLogin: 'Login obrigatório (só convidados)',
  convitesPessoais: 'Convites pessoais (link para criar conta)',
  contas: 'Contas (e-mail e senha)',
  paginaInicial: 'Página inicial',
  paginaEntrar: 'Página Entrar',
  appProtegido: 'App só abre com login',
  modelos: 'Modelos testados',
  reserva: 'IA reserva (Gemini, do Google)',
  agentes: 'Agentes (Nina, Gabriela, Matheus e Leo)',
  googleCloud: 'Acesso ao Google Cloud',
  ia: 'IA (Claude no Vertex AI)',
};
// Páginas principais: o site abre, a página Entrar abre e o app pede login.
for (const [nome, caminho, esperado] of [
  ['paginaInicial', '/', 200],
  ['paginaEntrar', '/entrar/', 200],
  ['appProtegido', '/app/', 302],
]) {
  try {
    const resp = await fetch(`${URL_APP}${caminho}`, { redirect: 'manual', headers: { Accept: 'text/html' } });
    r[nome] = resp.status === esperado ? 'ok' : `respondeu ${resp.status} (esperado ${esperado})`;
  } catch (e) {
    r[nome] = `sem resposta (${e.cause?.code ?? e.message})`;
  }
}
// Itens que, se falharem, fazem o robô voltar para a versão anterior (o site não pode ficar quebrado).
const CRITICOS = ['banco', 'exigeLogin', 'convitesPessoais', 'contas', 'paginaInicial', 'paginaEntrar', 'appProtegido'];
let critico = false;
let falhou = false;
console.log('\n===== Relatório do app publicado =====');
for (const [k, v] of Object.entries(r)) {
  const ok = v === 'ok' || v.startsWith('ok ');
  const opcional = k === 'modelos' || k === 'agentesDiagnostico';
  if (!ok && !opcional) falhou = true;
  if (!ok && CRITICOS.includes(k)) critico = true;
  console.log(`${ok ? '✅' : opcional ? 'ℹ️ ' : '❌'} ${rotulos[k] ?? k}: ${v}`);
  if (!ok && !opcional) console.log(`::error::${rotulos[k] ?? k}: ${v}`);
}
console.log('======================================\n');
// Saída 2 = problema grave (volta a versão anterior); 1 = algo opcional falhou (ex.: IA); 0 = tudo certo.
process.exit(critico ? 2 : falhou ? 1 : 0);
