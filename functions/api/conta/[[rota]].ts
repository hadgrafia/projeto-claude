import { criarConvite, chaveIp, conferirSenha, criarSessao, EMAIL, excedeu, hashSenha, iguais, lerCookie, lerConvite, lerSessao, problemaNaSenha, zerarTentativas, COOKIE } from '../../auth';
import { cifrar, decifrar } from '../../cripto';
import { conferirCodigo, linkAutenticador, normalizarRecuperacao, novoSegredo, novosCodigosRecuperacao } from '../../totp';
import { json, sha256, type Env } from '../../tipos';

/**
 * Conta do app (rotas públicas, cada uma com limite de tentativas):
 *  GET  /api/conta/estado          se há sessão aberta
 *  GET  /api/conta/convite?t=…     e-mail do convite (ou do link de senha nova), se ainda vale
 *  POST /api/conta/entrar          { email, senha }  abre a sessão
 *  POST /api/conta/cadastro        { convite, senha } cria a conta (ou a senha nova) pelo link pessoal
 *  POST /api/conta/senha           { atual, nova }   troca a senha de quem está logado
 *  POST /api/conta/sair            encerra a sessão deste aparelho
 *  GET  /api/conta/aparelhos       aparelhos conectados à conta
 *  POST /api/conta/aparelhos       { id } ou { todos: true }  desconecta aparelhos
 *  GET  /api/conta/duas-etapas     se a verificação em duas etapas está ligada
 *  POST /api/conta/duas-etapas     { acao: 'iniciar' | 'ativar' | 'desativar' | 'novos-codigos', senha?, codigo? }
 */
const MINUTO = 60_000;
// Hash falso para gastar o mesmo tempo quando o e-mail não tem conta (não revela quem tem).
const HASH_FALSO = 'pbkdf2$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';

interface DoisFatores {
  segredo: string | null;
  pendente: string | null;
  recuperacao: string | null;
  ultimo_passo: number;
}
const contextoTotp = (email: string) => `totp:${email}`;
const lerDoisFatores = (env: Env, email: string) => env.DB.prepare('SELECT segredo, pendente, recuperacao, ultimo_passo FROM dois_fatores WHERE email = ?').bind(email).first<DoisFatores>();

/**
 * Confere o código de 6 dígitos do app autenticador (ou um código de recuperação, que some depois de usado).
 * Um mesmo código de 6 dígitos nunca vale duas vezes.
 */
async function conferirSegundaEtapa(env: Env, email: string, f: DoisFatores, codigoBruto: string) {
  const codigo = codigoBruto.replace(/\s/g, '');
  if (/^\d{6}$/.test(codigo) && f.segredo) {
    const passo = await conferirCodigo(await decifrar(env, f.segredo, contextoTotp(email)), codigo, f.ultimo_passo);
    if (passo === null) return false;
    const r = await env.DB.prepare('UPDATE dois_fatores SET ultimo_passo = ? WHERE email = ? AND ultimo_passo < ?').bind(passo, email, passo).run();
    return r.meta.changes > 0;
  }
  const rec = normalizarRecuperacao(codigo);
  if (rec.length !== 8 || !f.recuperacao) return false;
  const lista = JSON.parse(f.recuperacao) as string[];
  const h = await sha256(`rec:${email}:${rec}`);
  const achado = lista.find((x) => iguais(x, h));
  if (!achado) return false;
  await env.DB.prepare('UPDATE dois_fatores SET recuperacao = ? WHERE email = ?').bind(JSON.stringify(lista.filter((x) => x !== achado)), email).run();
  return true;
}

async function gerarRecuperacao(email: string) {
  const codigos = novosCodigosRecuperacao();
  const hashes = await Promise.all(codigos.map((c) => sha256(`rec:${email}:${normalizarRecuperacao(c)}`)));
  return { codigos, json: JSON.stringify(hashes) };
}

const ler = async (request: Request) => (await request.json().catch(() => ({}))) as Record<string, unknown>;
const texto = (v: unknown, max = 254) => String(v ?? '').slice(0, max);

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const [acao] = (params.rota as string[] | undefined) ?? [];
  const ip = await chaveIp(request);

  if (acao === 'estado' && request.method === 'GET') {
    const s = await lerSessao(env, request);
    return json({ logado: Boolean(s.email) });
  }

  if (acao === 'convite' && request.method === 'GET') {
    if (await excedeu(env, `conv:${ip}`, 40, 15 * MINUTO)) return json({ erro: 'Muitas tentativas. Espere 15 minutos.' }, 429);
    const c = await lerConvite(env, new URL(request.url).searchParams.get('t') ?? '');
    if (!c) return json({ erro: 'Este link não vale mais: ele já foi usado ou passou do prazo. Peça um novo a quem te convidou.' }, 404);
    return json({ email: c.email, tipo: c.tipo });
  }

  if (acao === 'entrar' && request.method === 'POST') {
    const c = await ler(request);
    const email = texto(c.email).trim().toLowerCase();
    const senha = texto(c.senha, 200);
    if (!EMAIL.test(email) || !senha) return json({ erro: 'Digite seu e-mail e sua senha.' }, 400);
    if (await excedeu(env, ip, 30, 15 * MINUTO)) return json({ erro: 'Muitas tentativas. Espere 15 minutos e tente de novo.' }, 429);
    if (await excedeu(env, `email:${email}`, 6, 15 * MINUTO, false)) return json({ erro: 'Muitas tentativas para este e-mail. Espere 15 minutos ou toque em "Esqueci minha senha".' }, 429);
    const conta = await env.DB.prepare('SELECT senha FROM contas WHERE email = ?').bind(email).first<{ senha: string }>();
    const ok = await conferirSenha(senha, conta?.senha ?? HASH_FALSO);
    if (!conta || !ok) {
      await excedeu(env, `email:${email}`, 6, 15 * MINUTO);
      return json({ erro: 'E-mail ou senha incorretos. Se ainda não criou sua conta, abra o link do convite que você recebeu por e-mail.' }, 401);
    }
    // Verificação em duas etapas: sem o código do app autenticador, a senha sozinha não abre a conta.
    const f = await lerDoisFatores(env, email);
    if (f?.segredo) {
      const codigo = texto(c.codigo, 20).trim();
      if (!codigo) return json({ precisaCodigo: true });
      if (!(await conferirSegundaEtapa(env, email, f, codigo))) {
        await excedeu(env, `email:${email}`, 6, 15 * MINUTO);
        return json({ erro: 'Código incorreto ou já usado. Confira o código no app autenticador (ele muda a cada 30 segundos).', precisaCodigo: true }, 401);
      }
    }
    await zerarTentativas(env, `email:${email}`);
    return json({ ok: true }, 200, await criarSessao(env, email, request));
  }

  if (acao === 'cadastro' && request.method === 'POST') {
    if (await excedeu(env, `cad:${ip}`, 10, 60 * MINUTO)) return json({ erro: 'Muitas tentativas seguidas. Espere uma hora e tente de novo.' }, 429);
    const c = await ler(request);
    const token = texto(c.convite, 100);
    const senha = texto(c.senha, 200);
    const convite = await lerConvite(env, token);
    if (!convite) return json({ erro: 'Este link não vale mais: ele já foi usado ou passou do prazo. Peça um novo a quem te convidou.' }, 404);
    const problema = problemaNaSenha(senha, convite.email);
    if (problema) return json({ erro: problema }, 400);
    const agora = Date.now();
    await env.DB.batch([
      // O link é de uso único: some assim que é usado (junto com outros links do mesmo e-mail).
      env.DB.prepare('DELETE FROM convites_conta WHERE email = ?').bind(convite.email),
      env.DB.prepare('INSERT INTO contas (email, senha, criada_em, atualizada_em) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET senha = excluded.senha, atualizada_em = excluded.atualizada_em').bind(
        convite.email,
        await hashSenha(senha),
        agora,
        agora,
      ),
      // Senha nova: encerra as sessões antigas em todos os aparelhos.
      env.DB.prepare('DELETE FROM sessoes WHERE email = ?').bind(convite.email),
      env.DB.prepare('DELETE FROM tentativas WHERE chave = ?').bind(`email:${convite.email}`),
      env.DB.prepare('INSERT OR IGNORE INTO acessos (email, convidado_por, em) VALUES (?, ?, ?)').bind(convite.email, 'convite', agora),
      // Link de senha nova (só a administradora cria, e ele chega no e-mail da pessoa): serve para quem
      // perdeu o celular e os códigos de recuperação. A verificação em duas etapas é desligada e a
      // pessoa liga de novo nos Ajustes.
      env.DB.prepare('DELETE FROM dois_fatores WHERE email = ?').bind(convite.email),
    ]);
    return json({ ok: true, email: convite.email }, 200, await criarSessao(env, convite.email, request));
  }

  if (acao === 'senha' && request.method === 'POST') {
    const s = await lerSessao(env, request);
    if (!s.email) return json({ erro: 'Sua sessão expirou. Entre de novo.', sessao: true }, 401);
    if (await excedeu(env, `email:${s.email}`, 6, 15 * MINUTO, false)) return json({ erro: 'Muitas tentativas. Espere 15 minutos.' }, 429);
    const c = await ler(request);
    const conta = await env.DB.prepare('SELECT senha FROM contas WHERE email = ?').bind(s.email).first<{ senha: string }>();
    if (!conta || !(await conferirSenha(texto(c.atual, 200), conta.senha))) {
      await excedeu(env, `email:${s.email}`, 6, 15 * MINUTO);
      return json({ erro: 'A senha atual não confere.' }, 400);
    }
    const nova = texto(c.nova, 200);
    const problema = problemaNaSenha(nova, s.email);
    if (problema) return json({ erro: problema }, 400);
    const token = lerCookie(request)!;
    await env.DB.batch([
      env.DB.prepare('UPDATE contas SET senha = ?, atualizada_em = ? WHERE email = ?').bind(await hashSenha(nova), Date.now(), s.email),
      // Mantém este aparelho conectado e desconecta os outros.
      env.DB.prepare('DELETE FROM sessoes WHERE email = ? AND hash != ?').bind(s.email, await sha256(token)),
    ]);
    return json({ ok: true });
  }

  // Exclui a conta e TODOS os dados guardados no servidor. Devolve um convite pessoal (180 dias)
  // para a pessoa voltar com o mesmo e-mail, se quiser: só ela recebe, pelo próprio e-mail.
  if (acao === 'excluir' && request.method === 'POST') {
    const s = await lerSessao(env, request);
    if (!s.email) return json({ erro: 'Sua sessão expirou. Entre de novo.', sessao: true }, 401);
    const c = await ler(request);
    if (texto(c.confirmacao, 20).trim().toUpperCase() !== 'EXCLUIR') return json({ erro: 'Digite EXCLUIR para confirmar.' }, 400);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM dados_conta WHERE email = ?').bind(s.email),
      env.DB.prepare('DELETE FROM dois_fatores WHERE email = ?').bind(s.email),
      env.DB.prepare('DELETE FROM sessoes_info WHERE hash IN (SELECT hash FROM sessoes WHERE email = ?)').bind(s.email),
      env.DB.prepare('DELETE FROM sessoes WHERE email = ?').bind(s.email),
      env.DB.prepare('DELETE FROM convites_conta WHERE email = ?').bind(s.email),
      env.DB.prepare('DELETE FROM tentativas WHERE chave = ?').bind(`email:${s.email}`),
      env.DB.prepare('DELETE FROM contas WHERE email = ?').bind(s.email),
    ]);
    const volta = await criarConvite(env, s.email, 'conta', 'exclusao', new URL(request.url).origin);
    await env.DB.prepare('UPDATE convites_conta SET expira = ? WHERE email = ?').bind(Date.now() + 180 * 24 * 3600 * 1000, s.email).run();
    return json({ ok: true, email: s.email, volta }, 200, `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
  }

  if (acao === 'aparelhos') {
    const s = await lerSessao(env, request);
    if (!s.email) return json({ erro: 'Sua sessão expirou. Entre de novo.', sessao: true }, 401);
    if (request.method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT s.hash, s.criada_em, i.aparelho, i.pais, i.ultimo_uso FROM sessoes s LEFT JOIN sessoes_info i ON i.hash = s.hash WHERE s.email = ? AND s.expira > ? ORDER BY COALESCE(i.ultimo_uso, s.criada_em) DESC',
      )
        .bind(s.email, Date.now())
        .all<{ hash: string; criada_em: number; aparelho: string | null; pais: string | null; ultimo_uso: number | null }>();
      return json({
        aparelhos: results.map((a) => ({
          id: a.hash.slice(0, 16),
          aparelho: a.aparelho ?? 'Aparelho',
          pais: a.pais ?? undefined,
          entrouEm: a.criada_em,
          ultimoUso: a.ultimo_uso ?? a.criada_em,
          atual: a.hash === s.hash,
        })),
      });
    }
    if (request.method === 'POST') {
      const c = await ler(request);
      if (c.todos === true) {
        await env.DB.prepare('DELETE FROM sessoes WHERE email = ? AND hash != ?').bind(s.email, s.hash ?? '').run();
        return json({ ok: true });
      }
      const id = texto(c.id, 32);
      if (!/^[a-f0-9]{16}$/.test(id)) return json({ erro: 'Aparelho inválido.' }, 400);
      await env.DB.prepare('DELETE FROM sessoes WHERE email = ? AND substr(hash, 1, 16) = ? AND hash != ?').bind(s.email, id, s.hash ?? '').run();
      return json({ ok: true });
    }
  }

  if (acao === 'duas-etapas') {
    const s = await lerSessao(env, request);
    if (!s.email) return json({ erro: 'Sua sessão expirou. Entre de novo.', sessao: true }, 401);
    if (!env.DADOS_CHAVE) return json({ erro: 'A proteção ainda não foi ativada no servidor.' }, 503);
    const f = await lerDoisFatores(env, s.email);
    if (request.method === 'GET') {
      return json({ ativo: Boolean(f?.segredo), codigosRestantes: f?.recuperacao ? (JSON.parse(f.recuperacao) as string[]).length : 0 });
    }
    if (request.method !== 'POST') return json({ erro: 'Rota não encontrada.' }, 404);
    if (await excedeu(env, `email:${s.email}`, 6, 15 * MINUTO, false)) return json({ erro: 'Muitas tentativas. Espere 15 minutos.' }, 429);
    const c = await ler(request);
    const passo = texto(c.acao, 20);
    const senhaConfere = async () => {
      const conta = await env.DB.prepare('SELECT senha FROM contas WHERE email = ?').bind(s.email).first<{ senha: string }>();
      const ok = Boolean(conta && (await conferirSenha(texto(c.senha, 200), conta.senha)));
      if (!ok) await excedeu(env, `email:${s.email}`, 6, 15 * MINUTO);
      return ok;
    };

    // 1) Começar: confirma a senha e cria um segredo provisório (só vale depois de confirmar um código).
    if (passo === 'iniciar') {
      if (f?.segredo) return json({ erro: 'A verificação em duas etapas já está ligada.' }, 409);
      if (!(await senhaConfere())) return json({ erro: 'A senha não confere.' }, 400);
      const segredo = novoSegredo();
      await env.DB.prepare('INSERT INTO dois_fatores (email, pendente) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET pendente = excluded.pendente')
        .bind(s.email, await cifrar(env, segredo, contextoTotp(s.email)))
        .run();
      return json({ segredo, link: linkAutenticador(segredo, s.email) });
    }
    // 2) Ativar: o primeiro código do app autenticador confirma que ele foi configurado certo.
    if (passo === 'ativar') {
      if (!f?.pendente) return json({ erro: 'Comece de novo: toque em "Ligar verificação em duas etapas".' }, 400);
      const segredo = await decifrar(env, f.pendente, contextoTotp(s.email));
      const usado = await conferirCodigo(segredo, texto(c.codigo, 10).replace(/\s/g, ''));
      if (usado === null) {
        await excedeu(env, `email:${s.email}`, 6, 15 * MINUTO);
        return json({ erro: 'Código incorreto. Confira se o horário do celular está automático e digite o código que aparece agora.' }, 400);
      }
      const rec = await gerarRecuperacao(s.email);
      await env.DB.batch([
        env.DB.prepare('UPDATE dois_fatores SET segredo = pendente, pendente = NULL, recuperacao = ?, ultimo_passo = ?, ativado_em = ? WHERE email = ?').bind(rec.json, usado, Date.now(), s.email),
        // Por segurança, os outros aparelhos precisam entrar de novo (agora com o código).
        env.DB.prepare('DELETE FROM sessoes WHERE email = ? AND hash != ?').bind(s.email, s.hash ?? ''),
      ]);
      await zerarTentativas(env, `email:${s.email}`);
      return json({ ok: true, codigosRecuperacao: rec.codigos });
    }
    // Desligar ou gerar códigos de recuperação novos: senha + código atual.
    if (passo === 'desativar' || passo === 'novos-codigos') {
      if (!f?.segredo) return json({ erro: 'A verificação em duas etapas não está ligada.' }, 400);
      if (!(await senhaConfere())) return json({ erro: 'A senha não confere.' }, 400);
      if (!(await conferirSegundaEtapa(env, s.email, f, texto(c.codigo, 20)))) {
        await excedeu(env, `email:${s.email}`, 6, 15 * MINUTO);
        return json({ erro: 'Código incorreto ou já usado.' }, 400);
      }
      await zerarTentativas(env, `email:${s.email}`);
      if (passo === 'desativar') {
        await env.DB.prepare('DELETE FROM dois_fatores WHERE email = ?').bind(s.email).run();
        return json({ ok: true });
      }
      const rec = await gerarRecuperacao(s.email);
      await env.DB.prepare('UPDATE dois_fatores SET recuperacao = ? WHERE email = ?').bind(rec.json, s.email).run();
      return json({ ok: true, codigosRecuperacao: rec.codigos });
    }
    return json({ erro: 'Ação inválida.' }, 400);
  }

  if (acao === 'sair' && request.method === 'POST') {
    const token = lerCookie(request);
    if (token) await env.DB.prepare('DELETE FROM sessoes WHERE hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
  }

  return json({ erro: 'Rota não encontrada.' }, 404);
};
