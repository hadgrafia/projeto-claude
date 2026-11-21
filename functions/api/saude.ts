import { json, type Env } from '../tipos';
import { ordemModelos, regioes, testarModelo, tokenGoogle, type ContaServico } from './analise';
import { conversarComGemini, testarGemini } from './gemini';
import { ESQUEMA_AGENTES, paraAcoes, SISTEMA_AGENTES } from './agente';

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
  try {
    await env.DB.prepare('SELECT COUNT(*) AS n FROM convites_conta').first();
    r.convitesPessoais = 'ok';
  } catch (e) {
    r.convitesPessoais = `erro: ${(e as Error).message}`;
  }
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
      r.modelos = estados.join(' · ');
      if (usando) r.ia = `ok (usando ${usando})`;
      else {
        // Reserva: o Gemini, do próprio Google.
        const g = await testarGemini(env, conta);
        r.ia = g.usando ? `ok (usando a reserva ${g.usando}; o Claude está sem cota)` : 'nenhum modelo do Claude nem do Gemini respondeu';
        r.reserva = g.usando ? `ok (${g.usando})` : g.motivos.join(' · ');
      }
      // Agentes: uma pergunta de teste, com a mesma regra e o mesmo formato de resposta do app.
      try {
        const { json: a } = await conversarComGemini(env, conta, SISTEMA_AGENTES, [{ role: 'user', parts: [{ text: 'CONTEXTO: {"rendaMensal": 4000}\n\nMENSAGEM:\ngastei 25 reais no sorvete da Borelli' }] }], ESQUEMA_AGENTES);
        const x = paraAcoes(a as Parameters<typeof paraAcoes>[0]) as { agente?: string; acoes?: { tipo?: string; valor?: number }[] };
        r.agentes = x.agente && x.acoes?.some((c) => c.tipo === 'registrar' && Number(c.valor) === 25) ? `ok (${x.agente} preparou o registro de R$ 25)` : `resposta inesperada: agente=${x.agente} acoes=${JSON.stringify(x.acoes ?? null).slice(0, 300)}`;
      } catch (e) {
        r.agentes = `erro: ${((e as Error).message ?? '').slice(0, 200)}`;
      }
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

  return json(r);
};
