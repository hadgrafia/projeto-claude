// Libera (ou remove) e-mails no grupo "Convidados Meus Planos" do Cloudflare Access.
// Uso: EMAILS="a@x.com, b@y.com" ACAO=liberar|remover node scripts/liberar.mjs
const TOKEN = process.env.CLOUDFLARE_API_TOKEN?.trim();
const CONTA = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const ACAO = (process.env.ACAO || 'liberar').trim();
const NOME_GRUPO = 'Convidados Meus Planos';
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
  const r = await fetch(`https://api.cloudflare.com/client/v4${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok || corpo.success === false) parar(`${caminho}: ${JSON.stringify(corpo.errors ?? r.status)}`);
  return corpo.result;
}

const grupos = await cf(`/accounts/${CONTA}/access/groups`);
const grupo = grupos.find((g) => g.name === NOME_GRUPO);
if (!grupo) parar(`Grupo "${NOME_GRUPO}" não encontrado. Rode "Publicar na Cloudflare" primeiro.`);
const atuais = new Set(grupo.include.map((i) => i.email?.email?.toLowerCase()).filter(Boolean));

let include = grupo.include;
if (ACAO === 'remover') {
  include = grupo.include.filter((i) => !lista.includes(i.email?.email?.toLowerCase()));
} else {
  for (const e of lista) if (!atuais.has(e)) include = [...include, { email: { email: e } }];
}
await cf(`/accounts/${CONTA}/access/groups/${grupo.id}`, { method: 'PUT', body: JSON.stringify({ name: NOME_GRUPO, include }) });

for (const e of lista) {
  const tinha = atuais.has(e);
  if (ACAO === 'remover') console.log(`${tinha ? '✅ Removido' : 'ℹ️  Não estava na lista'}: ${mascarar(e)}`);
  else console.log(`${tinha ? 'ℹ️  Já estava liberado' : '✅ Liberado'}: ${mascarar(e)}`);
}
console.log(`Total de e-mails liberados agora: ${include.length}`);
