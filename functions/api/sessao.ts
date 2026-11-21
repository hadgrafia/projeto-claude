/** Depois do login no Cloudflare Access, volta para o app. */
export const onRequestGet: PagesFunction = async ({ request }) => Response.redirect(new URL('/', request.url).toString(), 302);
