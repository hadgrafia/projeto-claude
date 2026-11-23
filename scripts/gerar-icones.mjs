// Gera src/lib/marcas.ts com os ícones de marcas usados no app (assinaturas e apps de pagamento),
// a partir do pacote aberto simple-icons (licença CC0). Rodar só quando a lista mudar:
//   npm pack simple-icons && tar xzf simple-icons-*.tgz && SI=./package node scripts/gerar-icones.mjs
// Marcas que não estão no simple-icons aparecem no app como sigla na cor da marca.
import { readFileSync, writeFileSync } from 'node:fs';
const SI = process.env.SI ?? './package';
const dados = JSON.parse(readFileSync(`${SI}/data/simple-icons.json`, 'utf8'));
const lista = Array.isArray(dados) ? dados : dados.icons;
const slugs = process.argv.slice(2);
const m = new Map(lista.map((t) => [t.slug ?? t.title.toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, ''), t]));
let out = 'export const MARCAS: Record<string, { cor: string; caminho: string }> = {\n';
for (const s of slugs) {
  const t = m.get(s);
  if (!t) continue;
  const caminho = readFileSync(`${SI}/icons/${s}.svg`, 'utf8').match(/ d="([^"]+)"/)[1];
  out += `  ${JSON.stringify(s)}: { cor: ${JSON.stringify('#' + t.hex)}, caminho: ${JSON.stringify(caminho)} },\n`;
}
writeFileSync('src/lib/marcas.ts', out + '};\n');
