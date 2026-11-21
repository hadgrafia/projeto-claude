/** Endereço antigo de "entrar de novo": agora leva para a página Entrar. */
export const onRequestGet: PagesFunction = async ({ request }) => Response.redirect(new URL('/entrar/', request.url).toString(), 302);
