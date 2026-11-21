import { motion } from 'framer-motion';
import { useState } from 'react';
import { Icone } from '../components/Icone';
import { CampoDinheiro, Dinheiro, Entra, Folha, Markdown, Segmentado } from '../components/Ui';
import { db, lerCache, salvarCache, type Investimento, type PerfilRisco, type TipoInvestimento } from '../db';
import { situacaoPlano, useDados, useOnline, useSelic } from '../hooks';
import { pct, reais, reaisCurto } from '../lib/format';
import { pedirAnalise, type RespostaIA } from '../lib/ia';
import { calcularPerfil, cdiDaSelic, liquidoAnual, metaPoupanca, NOMES_INVESTIMENTO, PERGUNTAS_PERFIL, poupancaAnual, recomendar, reservaEmergencia } from '../lib/invest';
import { useLiveQuery } from 'dexie-react-hooks';
import { PerguntasPerfil } from '../components/PerguntasPerfil';

const ROTULO_PERFIL: Record<PerfilRisco, string> = { conservador: 'Conservador', moderado: 'Moderado', arrojado: 'Arrojado' };

export default function Investimentos() {
  const { investimentos, planos, livre, renda, gasto, perfil } = useDados();
  const selic = useSelic();
  const online = useOnline();
  const [editando, setEditando] = useState<Investimento | 'novo'>();
  const [perfilAberto, setPerfilAberto] = useState(false);
  const [ia, setIa] = useState({ carregando: false, erro: '' });
  const analise = useLiveQuery(() => lerCache<RespostaIA>('analise-investimentos'), []);
  const cdi = selic ? cdiDaSelic(selic.valor) : undefined;

  const aporteMensal = investimentos.reduce((a, i) => a + (i.frequencia === 'mensal' ? i.aporte : i.aporte / 12), 0);
  const saldoTotal = investimentos.reduce((a, i) => a + i.saldo, 0);
  const reserva = reservaEmergencia(gasto, 6);
  const reservaAtual = investimentos.filter((i) => ['cofrinho', 'cdb', 'tesouro-selic', 'poupanca'].includes(i.tipo) && !i.planoId).reduce((a, i) => a + i.saldo, 0);
  const sugerido = metaPoupanca(renda.mensal);

  async function analisarIA() {
    setIa({ carregando: true, erro: '' });
    try {
      const r = await pedirAnalise('investimentos', {
        rendaMensal: Math.round(renda.mensal),
        gastoMensalTipico: Math.round(gasto),
        valorLivreMensal: Math.round(livre),
        perfilInvestidor: perfil?.perfilRisco ?? 'não informado',
        reservaEmergenciaAtual: Math.round(reservaAtual),
        carteira: investimentos.map((i) => `${NOMES_INVESTIMENTO[i.tipo]}: saldo ${Math.round(i.saldo)}, aporte ${Math.round(i.aporte)}/${i.frequencia}`).join('; ') || 'nenhum',
        planos: planos.map((p) => `${p.tipo} meta ${Math.round(p.meta)} prazo ${p.prazo ?? 'livre'} (${p.percentual}% do livre)`).join('; '),
      });
      await salvarCache('analise-investimentos', r);
      setIa({ carregando: false, erro: '' });
    } catch (e) {
      setIa({ carregando: false, erro: (e as Error).message });
    }
  }

  return (
    <main className="tela">
      <div className="topo">
        <h1 className="titulo">Investimentos</h1>
        <button type="button" className="circulo terracota" aria-label="Adicionar investimento" onClick={() => setEditando('novo')}><Icone nome="mais" /></button>
      </div>

      <Entra>
        <section className="cartao verde">
          <span className="suave pequeno">Total investido</span>
          <Dinheiro valor={saldoTotal} className="valor-grande" />
          <div className="chips">
            <span className="pilula verde">Aportes: {reaisCurto(aporteMensal)}/mês</span>
            <span className="pilula terracota">Livre: {reaisCurto(livre)}/mês</span>
          </div>
        </section>
      </Entra>

      <Entra i={1}>
        <section className="cartao">
          <div className="entre">
            <strong>Taxas de hoje</strong>
            <span className="mini suave">{selic ? `Banco Central · ${selic.data}${selic.offline ? ' (salva)' : ''}` : online ? 'Consultando…' : 'Sem dados offline ainda'}</span>
          </div>
          {selic && cdi !== undefined && (
            <div className="grade-2">
              <div className="coluna" style={{ gap: 0 }}><span className="mini suave">Selic</span><strong className="num">{pct(selic.valor, 2)} a.a.</strong></div>
              <div className="coluna" style={{ gap: 0 }}><span className="mini suave">CDI (aprox.)</span><strong className="num">{pct(cdi, 2)} a.a.</strong></div>
              <div className="coluna" style={{ gap: 0 }}><span className="mini suave">CDB 100% CDI, 2 anos, líquido</span><strong className="num">{pct(liquidoAnual(cdi, 100, 24), 2)} a.a.</strong></div>
              <div className="coluna" style={{ gap: 0 }}><span className="mini suave">Poupança</span><strong className="num">{pct(poupancaAnual(selic.valor), 2)} a.a.</strong></div>
              <div className="coluna" style={{ gap: 0 }}><span className="mini suave">LCI/LCA 90% CDI (isenta)</span><strong className="num">{pct(liquidoAnual(cdi, 90, 24, true), 2)} a.a.</strong></div>
            </div>
          )}
        </section>
      </Entra>

      <Entra i={2}>
        <button type="button" className="cartao" style={{ border: 0, textAlign: 'left', cursor: 'pointer', flexDirection: 'row', alignItems: 'center' }} onClick={() => setPerfilAberto(true)}>
          <span className="circulo manter"><Icone nome="escudo" /></span>
          <span className="cresce coluna" style={{ gap: 2 }}>
            <strong>Perfil: {perfil?.perfilRisco ? ROTULO_PERFIL[perfil.perfilRisco] : 'não definido'}</strong>
            <span className="pequeno suave">Toque para refazer as 3 perguntas</span>
          </span>
          <Icone nome="direita" />
        </button>
      </Entra>

      <h2 className="secao">Quanto reservar</h2>
      <Entra i={3}>
        <section className="cartao">
          <div className="entre pequeno"><span>Sugestão para planos e investimentos (20% da renda mensal)</span><strong className="num">{reaisCurto(sugerido)}/mês</strong></div>
          <div className="entre pequeno"><span>O que sobra hoje (renda − gastos)</span><strong className="num">{reaisCurto(livre)}/mês</strong></div>
          <p className="pequeno suave">
            {livre >= sugerido
              ? 'Você já consegue reservar 20% ou mais. Mantenha os aportes automáticos no dia em que o dinheiro entra.'
              : `Faltam ${reaisCurto(sugerido - livre)}/mês para chegar aos 20%. O Feedback mostra onde cortar.`}
          </p>
          <div className="entre pequeno" style={{ borderTop: '1px solid var(--linha)', paddingTop: 8 }}>
            <span>Reserva de emergência (6 meses de gastos)</span>
            <strong className="num">{reaisCurto(reservaAtual)} de {reaisCurto(reserva)}</strong>
          </div>
          <p className="mini suave">Antes de investir em algo que oscila, tenha essa reserva em aplicação de liquidez diária (Tesouro Selic, CDB 100% do CDI ou cofrinho que renda 100% do CDI).</p>
        </section>
      </Entra>

      <h2 className="secao">Plano de investimento por objetivo</h2>
      {planos.map((p, i) => {
        const s = situacaoPlano(p, investimentos, livre, selic?.valor);
        const r = recomendar(s.prazoMeses ?? s.meses, perfil?.perfilRisco, cdi);
        return (
          <Entra key={p.id} i={i + 4}>
            <section className="cartao">
              <div className="entre">
                <strong>{p.nome}</strong>
                <span className="pilula rever">{r.horizonte === 'curto' ? 'Até 2 anos' : r.horizonte === 'medio' ? '2 a 5 anos' : 'Mais de 5 anos'}</span>
              </div>
              <span className="pequeno">
                Investir: <strong>{reaisCurto(s.meuAporte)}/mês</strong>
                {renda.mensal > 0 ? ` (${pct((s.meuAporte / renda.mensal) * 100, 1)} da sua renda mensal)` : ''}
                {s.necessario !== undefined ? ` · para o prazo: ${reaisCurto(s.necessario)}/mês` : ''}
              </span>
              <div className="linha" style={{ height: 10, borderRadius: 999, overflow: 'hidden', gap: 2 }} aria-hidden="true">
                {r.alocacao.map((a, j) => (
                  <motion.div key={a.classe} initial={{ width: 0 }} animate={{ width: `${a.pct}%` }} transition={{ duration: 0.8, delay: j * 0.08 }} style={{ height: '100%', background: ['var(--verde)', 'var(--terracota)', '#D9774F', '#8A9A86'][j] }} />
                ))}
              </div>
              {r.alocacao.map((a) => (
                <div key={a.classe} className="entre pequeno"><span>{a.classe}</span><strong className="num">{a.pct}% · {reaisCurto((s.aporte * a.pct) / 100)}</strong></div>
              ))}
              <details>
                <summary className="pequeno" style={{ cursor: 'pointer', fontWeight: 700 }}>Onde investir e por quê</summary>
                <div className="coluna" style={{ marginTop: 8 }}>
                  {r.opcoes.map((o) => (
                    <div key={o.nome} className="coluna" style={{ gap: 2, paddingBottom: 6, borderBottom: '1px solid var(--linha)' }}>
                      <div className="entre"><strong className="pequeno">{o.nome}</strong><span className={`pilula ${o.risco === 'baixo' ? 'manter' : o.risco === 'médio' ? 'rever' : 'cortar'}`}>risco {o.risco}</span></div>
                      <span className="mini">{o.porque}</span>
                      <span className="mini suave">Onde: {o.onde} · Resgate: {o.liquidez}</span>
                    </div>
                  ))}
                </div>
              </details>
            </section>
          </Entra>
        );
      })}

      <section className="cartao grafite">
        <div className="linha">
          <span className="circulo terracota"><Icone nome="ia" /></span>
          <div className="coluna cresce" style={{ gap: 2 }}>
            <strong>Planejamento inteligente com IA</strong>
            <span className="pequeno suave">Compara taxas atuais de bancos, Tesouro e corretoras para o seu caso. Envia só números, sem nomes nem dados bancários.</span>
          </div>
        </div>
        <button type="button" className="botao terracota" onClick={analisarIA} disabled={ia.carregando || !online}>
          {ia.carregando ? 'Pesquisando… (1 a 2 minutos)' : online ? (analise ? 'Atualizar planejamento' : 'Gerar planejamento') : 'Precisa de internet'}
        </button>
        {ia.erro && <p className="pequeno">{ia.erro}</p>}
      </section>
      {analise && (
        <section className="cartao">
          <span className="mini suave">Gerado em {new Date(analise.valor.geradaEm).toLocaleString('pt-BR')} · disponível offline</span>
          <Markdown texto={analise.valor.texto + (analise.valor.fontes.length ? `\n## Fontes\n${analise.valor.fontes.map((f) => `- [${f.titulo}](${f.url})`).join('\n')}` : '')} />
        </section>
      )}

      <h2 className="secao">Sua carteira</h2>
      {investimentos.length === 0 && <p className="vazio">Cadastre cofrinhos, CDBs, Tesouro ou qualquer investimento para acompanhar aqui.</p>}
      {investimentos.length > 0 && (
        <div className="lista">
          {investimentos.map((inv) => (
            <button key={inv.id} type="button" className="item" onClick={() => setEditando(inv)}>
              <span className="circulo manter"><Icone nome="cofre" /></span>
              <span className="cresce coluna" style={{ gap: 2 }}>
                <strong>{inv.nome}</strong>
                <span className="pequeno suave">
                  {NOMES_INVESTIMENTO[inv.tipo]}{inv.instituicao ? ` · ${inv.instituicao}` : ''}
                  {inv.planoId ? ` · ${planos.find((p) => p.id === inv.planoId)?.nome ?? ''}` : ''}
                </span>
              </span>
              <span className="coluna" style={{ alignItems: 'flex-end', gap: 2 }}>
                <strong className="num">{reaisCurto(inv.saldo)}</strong>
                <span className="mini suave">+{reaisCurto(inv.aporte)}/{inv.frequencia === 'mensal' ? 'mês' : 'ano'}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="mini suave">Orientação educativa, baseada em regras gerais de planejamento. Não é recomendação de investimento registrada na CVM. Confira taxas, prazos e a cobertura do FGC antes de aplicar.</p>

      <Folha aberta={!!editando} aoFechar={() => setEditando(undefined)} titulo={editando === 'novo' ? 'Novo investimento' : 'Editar investimento'}>
        {editando && <FormInvestimento inv={editando === 'novo' ? undefined : editando} planos={planos.map((p) => ({ id: p.id!, nome: p.nome }))} aoSalvar={() => setEditando(undefined)} />}
      </Folha>
      <Folha aberta={perfilAberto} aoFechar={() => setPerfilAberto(false)} titulo="Perfil de investidor">
        <QuestionarioPerfil aoSalvar={() => setPerfilAberto(false)} />
      </Folha>
    </main>
  );
}

function FormInvestimento({ inv, planos, aoSalvar }: { inv?: Investimento; planos: { id: number; nome: string }[]; aoSalvar: () => void }) {
  const [f, setF] = useState<Omit<Investimento, 'id' | 'atualizadoEm'>>({
    nome: inv?.nome ?? '',
    tipo: inv?.tipo ?? 'cofrinho',
    instituicao: inv?.instituicao ?? '',
    saldo: inv?.saldo ?? 0,
    aporte: inv?.aporte ?? 0,
    frequencia: inv?.frequencia ?? 'mensal',
    rentabilidade: inv?.rentabilidade,
    indexador: inv?.indexador ?? 'cdi',
    planoId: inv?.planoId,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function salvar() {
    const dados = { ...f, nome: f.nome.trim() || NOMES_INVESTIMENTO[f.tipo], atualizadoEm: new Date().toISOString() };
    if (inv?.id) await db.investimentos.update(inv.id, dados);
    else await db.investimentos.add(dados);
    aoSalvar();
  }

  return (
    <>
      <label className="campo">Tipo
        <select value={f.tipo} onChange={(e) => set('tipo', e.target.value as TipoInvestimento)}>
          {(Object.keys(NOMES_INVESTIMENTO) as TipoInvestimento[]).map((t) => <option key={t} value={t}>{NOMES_INVESTIMENTO[t]}</option>)}
        </select>
      </label>
      <label className="campo">Nome
        <input value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Cofrinho Casa Nova" />
      </label>
      <label className="campo">Banco ou corretora
        <input value={f.instituicao} onChange={(e) => set('instituicao', e.target.value)} placeholder="Opcional" />
      </label>
      <CampoDinheiro rotulo="Saldo atual" valor={f.saldo || undefined} aoMudar={(v) => set('saldo', v ?? 0)} />
      <CampoDinheiro rotulo="Quanto você coloca" valor={f.aporte || undefined} aoMudar={(v) => set('aporte', v ?? 0)} />
      <Segmentado rotulo="Frequência" valor={f.frequencia} aoMudar={(v) => set('frequencia', v)} opcoes={[{ valor: 'mensal', rotulo: 'Por mês' }, { valor: 'anual', rotulo: 'Por ano' }]} />
      <div className="grade-2">
        <label className="campo">Rende
          <input inputMode="decimal" value={f.rentabilidade ?? ''} onChange={(e) => set('rentabilidade', e.target.value ? Number(e.target.value.replace(',', '.')) : undefined)} placeholder="Ex.: 100" />
        </label>
        <label className="campo">Unidade
          <select value={f.indexador} onChange={(e) => set('indexador', e.target.value as 'cdi' | 'aa')}>
            <option value="cdi">% do CDI</option>
            <option value="aa">% ao ano</option>
          </select>
        </label>
      </div>
      <label className="campo">Para qual plano?
        <select value={f.planoId ?? ''} onChange={(e) => set('planoId', e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">Nenhum (reserva / geral)</option>
          {planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </label>
      <button type="button" className="botao" onClick={salvar}>Salvar</button>
      {inv?.id && (
        <button type="button" className="botao perigo" onClick={async () => { await db.investimentos.delete(inv.id!); aoSalvar(); }}>
          <Icone nome="lixo" /> Apagar
        </button>
      )}
      <p className="mini suave">Saldo atual: {reais(f.saldo)}. Atualize quando quiser, olhando o app do seu banco.</p>
    </>
  );
}

function QuestionarioPerfil({ aoSalvar }: { aoSalvar: () => void }) {
  const [r, setR] = useState<(number | undefined)[]>([]);
  return (
    <>
      <PerguntasPerfil respostas={r} aoResponder={(i, v) => setR((x) => Object.assign([...x], { [i]: v }))} />
      <button
        type="button"
        className="botao"
        disabled={PERGUNTAS_PERFIL.some((_, i) => r[i] === undefined)}
        onClick={async () => { await db.perfil.update('eu', { perfilRisco: calcularPerfil(r.map((x) => x ?? 0)) }); aoSalvar(); }}
      >
        Salvar perfil
      </button>
    </>
  );
}
