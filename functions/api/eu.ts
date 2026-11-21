import { json, quemEsta, type Env } from '../tipos';

/** Quem está usando o app (e-mail da conta) e se é a administradora. */
export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const email = quemEsta(data);
  return json({ email, admin: Boolean(email) && email === (env.ADMIN_EMAIL ?? '').toLowerCase() });
};
