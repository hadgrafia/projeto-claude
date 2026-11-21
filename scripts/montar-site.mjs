// Copia a página de apresentação (site/) para a raiz de dist/, ao lado do app em dist/app/.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
const raiz = new URL('..', import.meta.url);
const site = new URL('site/', raiz);
const dist = new URL('dist/', raiz);
if (!existsSync(dist)) mkdirSync(dist);
// Limpa a raiz (sobras de versões antigas), mantendo só o app recém-gerado em dist/app.
for (const nome of readdirSync(dist)) if (nome !== 'app') rmSync(new URL(nome, dist), { recursive: true, force: true });
cpSync(site, dist, { recursive: true });
cpSync(new URL('public/icon.svg', raiz), new URL('dist/icon.svg', raiz));
cpSync(new URL('public/apple-touch-icon.png', raiz), new URL('dist/apple-touch-icon.png', raiz));
console.log('Página de apresentação copiada para dist/');
