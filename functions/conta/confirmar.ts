import { criarSessao, emailConfirmadoPeloAccess } from '../auth';
import { sha256, type Env } from '../tipos';

/**
 * Último passo do cadastro (ou da troca de senha). Este endereço é protegido pelo
 * Cloudflare Access: só chega aqui quem digitou o código enviado ao e-mail convidado.
 * Conferimos que o e-mail confirmado é o mesmo do cadastro, ativamos a conta e abrimos a sessão.
 */
const pagina = (titulo: string, texto: string, status = 400) =>
  new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo} · Meus Planos</title><link rel="stylesheet" href="/site.css"></head>` +
      `<body class="pagina-conta"><main class="conta-caixa cartao"><img src="/icon.svg" width="56" height="56" alt=""><h1 class="conta-titulo">${titulo}</h1><p>${texto}</p><a class="botao botao-terracota" href="/entrar/">Voltar para Entrar</a></main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return pagina('Link inválido', 'Comece o cadastro de novo na página Entrar.');
  const email = await emailConfirmadoPeloAccess(env, request);
  if (!email) return pagina('E-mail não confirmado', 'Não foi possível confirmar o seu e-mail. Se ele ainda não foi convidado, peça um convite na página inicial.', 403);

  const hash = await sha256(token);
  const c = await env.DB.prepare('SELECT email, senha, expira FROM cadastros WHERE hash = ?').bind(hash).first<{ email: string; senha: string; expira: number }>();
  if (!c || c.expira < Date.now()) return pagina('Cadastro expirado', 'O cadastro vale por 30 minutos. Faça de novo na página Entrar: é rapidinho.');
  if (c.email !== email)
    return pagina('E-mails diferentes', 'O e-mail confirmado com o código não é o mesmo do cadastro. Faça o cadastro de novo usando o mesmo e-mail nas duas telas.', 403);

  const agora = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM cadastros WHERE hash = ?').bind(hash),
    env.DB.prepare('INSERT INTO contas (email, senha, criada_em, atualizada_em) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET senha = excluded.senha, atualizada_em = excluded.atualizada_em').bind(
      email,
      c.senha,
      agora,
      agora,
    ),
    // Senha nova: encerra as sessões antigas em todos os aparelhos.
    env.DB.prepare('DELETE FROM sessoes WHERE email = ?').bind(email),
    env.DB.prepare('DELETE FROM tentativas WHERE chave = ?').bind(`email:${email}`),
  ]);
  const cookie = await criarSessao(env, email);
  return new Response(null, { status: 302, headers: { Location: '/entrar/?pronto=1', 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });
};
