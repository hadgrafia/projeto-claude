import { json, type Env } from '../tipos';
import { ordemModelos, regioes, testarModelo, tokenGoogle, type ContaServico } from './analise';

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
  r.confirmacaoEmail = env.ACCESS_EQUIPE && env.ACCESS_AUD ? 'ok' : 'falta ACCESS_EQUIPE/ACCESS_AUD';
  try {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM contas').first<{ n: number }>();
    r.contas = `ok (${n?.n ?? 0} contas criadas)`;
  } catch (e) {
    r.contas = `erro: ${(e as Error).message}`;
  }

  if (!env.GCP_SA_KEY) r.ia = 'GCP_SA_KEY não configurado na Cloudflare';
  else {
    try {
      const conta = JSON.parse(env.GCP_SA_KEY) as ContaServico;
      if (!conta.client_email || !conta.private_key) throw new Error('o texto colado não é o arquivo JSON da conta de serviço');
      await tokenGoogle(conta);
      r.googleCloud = 'ok';
      // Testa cada modelo: diz qual está funcionando e por que os outros não.
      const estados: string[] = [];
      let usando = '';
      // Para cada modelo, tenta as regiões até achar uma com cota.
      for (const modelo of ordemModelos(env)) {
        const motivos: string[] = [];
        for (const regiao of regioes(env)) {
          try {
            if (await testarModelo(env, conta, modelo, regiao)) {
              usando = `${modelo} na região ${regiao}`;
              break;
            }
            motivos.push(`${regiao}: resposta inesperada`);
          } catch (e) {
            const st = (e as { status?: number }).status;
            motivos.push(`${regiao}: ${st === 429 ? 'sem cota' : st === 404 ? 'não ativado' : st === 403 ? 'sem permissão' : `erro ${st ?? ''} ${((e as Error).message ?? '').replace(/\s+/g, ' ').slice(0, 100)}`}`);
            if (st === 404 && regiao === regioes(env)[0] && modelo.startsWith('claude-3')) break; // modelo aposentado: não insiste
          }
        }
        estados.push(usando ? `${modelo}: ok` : `${modelo} (${motivos.join(', ')})`);
        if (usando) break; // achou um que funciona: não precisa gastar testando os demais
      }
      r.ia = usando ? `ok (usando ${usando})` : 'nenhum modelo do Claude respondeu';
      r.modelos = estados.join(' · ');
    } catch (e) {
      const msg = ((e as Error).message ?? String(e)).replace(/\s+/g, ' ');
      const dica = /403|permission/i.test(msg)
        ? 'a conta de serviço não tem o papel "Vertex AI User" ou a Vertex AI API está desligada'
        : /billing/i.test(msg)
          ? 'o projeto do Google Cloud está sem faturamento (cartão)'
          : 'erro';
      r.ia = `${dica} · resposta do Google: ${msg.slice(0, 400)}`;
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
