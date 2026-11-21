// Adiciona (ou remove) pessoas do Meus Planos.
// - liberar: coloca o e-mail na lista "Pedidos de convite" do app (Ajustes), já pronto para a
//   administradora tocar em "Aprovar" e enviar o convite pessoal pelo próprio e-mail.
//   (O link de convite nunca aparece aqui: este registro do GitHub é público.)
// - remover: apaga a conta, desconecta a pessoa de todos os aparelhos e cancela convites.
// Uso: EMAILS="a@x.com, b@y.com" ACAO=liberar|remover node scripts/liberar.mjs
import { createHash, randomBytes } from 'node:crypto';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN?.trim();
const CONTA = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const ACAO = (process.env.ACAO || 'liberar').trim();
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

const parar = (m) => {
  console.error(`❌ ${m}`);
  process.exit(1);
};
const mascarar = (e) => e.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => `${a}${'*'.repeat(Math.max(1, b.length))}${c}`);

const lista = [...new Set((process.env.EMAILS ?? '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
if (!lista.length) parar('Nenhum e-mail informado.');
const invalidos = lista.filter((e) => !EMAIL.test(e));
if (invalidos.length) parar(`E-mail(s) inválido(s): ${invalidos.map(mascarar).join(', ')}`);
// Esconde os e-mails no registro do GitHub.
for (const e of lista) console.log(`::add-mask::${e}`);

async function cf(caminho, init = {}) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${caminho}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok || corpo.success === false) parar(`${caminho}: ${JSON.stringify(corpo.errors ?? r.status)}`);
  return corpo.result;
}
const banco = (await cf(`/accounts/${CONTA}/d1/database?name=meus-planos`)).find((b) => b.name === 'meus-planos');
if (!banco) parar('Banco "meus-planos" não encontrado. Rode "Publicar na Cloudflare" primeiro.');
const sql = (sql, params) => cf(`/accounts/${CONTA}/d1/database/${banco.uuid}/query`, { method: 'POST', body: JSON.stringify({ sql, params }) });

for (const e of lista) {
  if (ACAO === 'remover') {
    for (const q of ['DELETE FROM sessoes WHERE email = ?', 'DELETE FROM contas WHERE email = ?', 'DELETE FROM convites_conta WHERE email = ?', 'DELETE FROM acessos WHERE email = ?'])
      await sql(q, [e]);
    await sql("UPDATE pedidos SET status = 'removido' WHERE email = ?", [e]);
    console.log(`✅ Removido (conta apagada e desconectado): ${mascarar(e)}`);
    continue;
  }
  const temConta = (await sql('SELECT 1 AS x FROM contas WHERE email = ?', [e]))[0]?.results?.length;
  if (temConta) {
    console.log(`ℹ️  Já tem conta: ${mascarar(e)}`);
    continue;
  }
  const ip = createHash('sha256').update(`robo-${e}`).digest('hex').slice(0, 32);
  await sql("DELETE FROM pedidos WHERE email = ? AND status = 'pendente'", [e]);
  await sql("INSERT INTO pedidos (id, nome, email, mensagem, status, ip_hash, criado_em) VALUES (?, ?, ?, ?, 'pendente', ?, ?)", [
    randomBytes(16).toString('hex'),
    e.split('@')[0],
    e,
    'Adicionado pela administradora',
    ip,
    Date.now(),
  ]);
  console.log(`✅ Pronto para aprovar no app (Ajustes → Pedidos de convite): ${mascarar(e)}`);
}
