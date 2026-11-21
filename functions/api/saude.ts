import { json, type Env } from '../tipos';
import { clienteVertex, tokenGoogle, type ContaServico } from './analise';

/**
 * Verificação automática, chamada só pelo robô de publicação (exige o código VERIFICACAO).
 * Responde apenas "ok" ou o motivo do problema: nunca devolve chaves, e-mails ou dados.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.VERIFICACAO || request.headers.get('X-Verificacao') !== env.VERIFICACAO) return json({ erro: 'Não autorizado.' }, 401);
  const r: Record<string, string> = {};

  try {
    const t = await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('planos','membros','convites','acessos')").first<{ n: number }>();
    r.banco = t?.n === 4 ? 'ok' : `faltam tabelas (${t?.n ?? 0} de 4)`;
  } catch (e) {
    r.banco = `erro: ${(e as Error).message}`;
  }

  r.emailAdministradora = env.ADMIN_EMAIL ? 'ok' : 'não configurado';
  r.exigeLogin = env.EXIGIR_ACCESS === '1' ? 'ok' : 'DESLIGADO';

  if (!env.GCP_SA_KEY) r.ia = 'GCP_SA_KEY não configurado na Cloudflare';
  else {
    try {
      const conta = JSON.parse(env.GCP_SA_KEY) as ContaServico;
      if (!conta.client_email || !conta.private_key) throw new Error('o texto colado não é o arquivo JSON da conta de serviço');
      await tokenGoogle(conta);
      r.googleCloud = 'ok';
      const client = await clienteVertex(env, conta);
      const m = await client.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 2048,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: 'Responda só com a palavra: ok' }],
      });
      r.ia = m.content.some((b) => b.type === 'text' && /ok/i.test(b.text)) ? 'ok' : `resposta inesperada (${m.stop_reason})`;
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      r.ia = /404|not found/i.test(msg)
        ? 'Claude Opus 5.5 não está ativado no Model Garden do Vertex AI'
        : /403|permission/i.test(msg)
          ? 'a conta de serviço não tem o papel "Vertex AI User" ou a Vertex AI API está desligada'
          : /billing/i.test(msg)
            ? 'o projeto do Google Cloud está sem faturamento (cartão)'
            : `erro: ${msg.slice(0, 300)}`;
    }
  }

  if (!env.CF_ACCESS_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_ACCESS_GROUP_ID) r.convitesAutomaticos = 'desligado (familiares são liberados à mão no Zero Trust)';
  else {
    try {
      const g = (await (
        await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/groups/${env.CF_ACCESS_GROUP_ID}`, { headers: { Authorization: `Bearer ${env.CF_ACCESS_TOKEN}` } })
      ).json()) as { success: boolean; result?: { include: unknown[] }; errors?: unknown };
      r.convitesAutomaticos = g.success ? `ok (${g.result?.include.length ?? 0} e-mails liberados)` : `token sem permissão: ${JSON.stringify(g.errors).slice(0, 200)}`;
    } catch (e) {
      r.convitesAutomaticos = `erro: ${(e as Error).message}`;
    }
  }
  return json(r);
};
