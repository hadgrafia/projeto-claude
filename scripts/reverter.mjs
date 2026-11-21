// Segurança das atualizações: guarda qual versão está no ar antes de publicar e, se a versão
// nova falhar na verificação, volta para ela na hora (o site e o app nunca ficam quebrados).
// Uso: node scripts/reverter.mjs anotar   → grava a versão atual em GITHUB_OUTPUT (anterior=…)
//      ANTERIOR=<id> node scripts/reverter.mjs voltar
import { appendFileSync } from 'node:fs';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN?.trim();
const CONTA = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const BASE = `https://api.cloudflare.com/client/v4/accounts/${CONTA}/pages/projects/meus-planos-financeiros`;
const cf = async (caminho, init = {}) => (await fetch(`${BASE}${caminho}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}` } })).json();

if (process.argv[2] === 'anotar') {
  const p = await cf('');
  const id = p.result?.canonical_deployment?.id ?? '';
  console.log(id ? `Versão no ar antes desta publicação: ${id}` : 'Ainda não havia versão no ar.');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `anterior=${id}\n`);
} else if (process.argv[2] === 'voltar') {
  const id = process.env.ANTERIOR;
  if (!id) {
    console.log('Não há versão anterior para voltar.');
    process.exit(1);
  }
  const r = await cf(`/deployments/${id}/rollback`, { method: 'POST' });
  if (!r.success) {
    console.error(`❌ Não consegui voltar sozinho: ${JSON.stringify(r.errors)}. No painel: Workers & Pages → meus-planos-financeiros → Deployments → Rollback.`);
    process.exit(1);
  }
  console.log(`↩️  A versão nova tinha um problema grave e foi retirada. O site e o app voltaram para a versão anterior (${id}), que já funcionava.`);
}
