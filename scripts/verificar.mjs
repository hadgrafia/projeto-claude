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
  process.exit(1);
}

const rotulos = {
  banco: 'Banco do plano em conjunto',
  emailAdministradora: 'E-mail da administradora',
  exigeLogin: 'Login obrigatório (só convidados)',
  confirmacaoEmail: 'Confirmação do e-mail no cadastro',
  contas: 'Contas (e-mail e senha)',
  modelos: 'Modelos testados',
  reserva: 'IA reserva (Gemini, do Google)',
  googleCloud: 'Acesso ao Google Cloud',
  ia: 'IA (Claude no Vertex AI)',
  convitesAutomaticos: 'Convite automático de familiares',
};
let falhou = false;
console.log('\n===== Relatório do app publicado =====');
for (const [k, v] of Object.entries(r)) {
  const ok = v === 'ok' || v.startsWith('ok ');
  const opcional = (k === 'convitesAutomaticos' && v.startsWith('desligado')) || k === 'modelos';
  if (!ok && !opcional) falhou = true;
  console.log(`${ok ? '✅' : opcional ? 'ℹ️ ' : '❌'} ${rotulos[k] ?? k}: ${v}`);
  if (!ok && !opcional) console.log(`::error::${rotulos[k] ?? k}: ${v}`);
}
console.log('======================================\n');
process.exit(falhou ? 1 : 0);
