import { emailAccess, json, type Env } from '../tipos';

/** Quem está usando o app (e-mail confirmado pelo Cloudflare Access) e se é a administradora. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const email = emailAccess(request);
  return json({ email, admin: Boolean(email) && email === (env.ADMIN_EMAIL ?? '').toLowerCase() });
};
