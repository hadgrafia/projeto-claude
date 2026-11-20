import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icone } from '../components/Icone';
import { Barra, Casa, CampoDinheiro, Dinheiro, Entra, Folha, Markdown } from '../components/Ui';
import { db } from '../db';
import { situacaoPlano, useDados, useOnline, useSelic } from '../hooks';
import { mesCurto, pct, reais, reaisCurto } from '../lib/format';
import { pedirAnalise } from '../lib/ia';
import { cdiDaSelic, recomendar } from '../lib/invest';
import { PLANOS } from '../lib/planos';

export default function PlanoDetalhe() {
  const { id } = useParams();
  const navegar = useNavigate();
  const online = useOnline();
  const { planos, investimentos, livre, renda, perfil } = useDados();
  const selic = useSelic();
  const [deposito, setDeposito] = useState(false);
  const [valorDep, setValorDep] = useState<number>();
  const [carregandoIA, setCarregandoIA] = useState(false);
  const [erroIA, setErroIA] = useState('');
  const plano = planos.find((p) => p.id === Number(id));
  if (!plano) return <main className="tela"><p className="vazio">Plano não encontrado.</p></main>;

  const s = situacaoPlano(plano, investimentos, livre, selic?.valor);
  const res = PLANOS[plano.tipo].calcular(plano.respostas);
  const custoMensal = res.mensal?.reduce((a, b) => a + b.valor, 0) ?? 0;
  const rec = recomendar(s.prazoMeses ?? s.meses, perfil?.perfilRisco, selic ? cdiDaSelic(selic.valor) : undefined);
  const ligados = investimentos.filter((i) => i.planoId === plano.id);

  async function analisar() {
    setErroIA('');
    setCarregandoIA(true);
    try {
      const { __metaManual: _m, ...respostas } = plano!.respostas;
      const r = await pedirAnalise(plano!.tipo, {
        ...respostas,
        metaAtual: Math.round(plano!.meta),
        jaGuardado: Math.round(s.guardado),
        aporteMensalPlanejado: Math.round(s.aporte),
        rendaMediaMensal: Math.round(renda.media),
        perfilInvestidor: perfil?.perfilRisco ?? 'não informado',
        prazoMeses: s.prazoMeses ?? 'não definido',
      });
      const fontes = r.fontes.length ? `\n\n## Fontes\n${r.fontes.map((f) => `- [${f.titulo}](${f.url})`).join('\n')}` : '';
      await db.planos.update(plano!.id!, { analiseIA: { texto: r.texto + fontes, geradaEm: r.geradaEm } });
    } catch (e) {
      setErroIA((e as Error).message);
    } finally {
      setCarregandoIA(false);
    }
  }

  return (
    <main className="tela sem-nav">
      <div className="topo">
        <div className="linha">
          <button type="button" className="circulo escuro" aria-label="Voltar" onClick={() => navegar('/planos')}><Icone nome="voltar" /></button>
          <h1 className="titulo" style={{ fontSize: 24 }}>{plano.nome}</h1>
        </div>
        <Link to={`/planos/${plano.id}/editar`} className="circulo card" aria-label="Editar plano"><Icone nome="lapis" /></Link>
      </div>

      <Entra>
        <section className="cartao terracota" style={{ borderRadius: 28, padding: 20 }}>
          <div className="linha">
            <div className="coluna cresce" style={{ gap: 6 }}>
              <span className="pequeno" style={{ fontWeight: 600 }}>Meta</span>
              <Dinheiro valor={plano.meta} className="valor-grande" />
              <span className="pequeno"><Dinheiro valor={s.guardado} /> guardados · {pct(s.pct)}</span>
            </div>
            <span style={{ color: '#fff' }}><Casa pct={s.pct} tamanho={92} /></span>
          </div>
          <Barra pct={s.pct} rotulo="Progresso" />
        </section>
      </Entra>

      <div className="grade-2">
        <div className="cartao" style={{ gap: 2 }}>
          <span className="mini suave">Separando por mês</span>
          <strong className="num" style={{ fontSize: 18 }}>{reaisCurto(s.aporte)}</strong>
          <span className="mini suave">{pct(plano.percentual)} do livre</span>
        </div>
        <div className="cartao" style={{ gap: 2 }}>
          <span className="mini suave">Previsão</span>
          <strong style={{ fontSize: 18 }}>{s.previsao ? mesCurto(s.previsao) : '—'}</strong>
          <span className="mini suave">{Number.isFinite(s.meses) ? `${s.meses} meses${s.rendimentoAa > 0 ? ', com rendimento' : ''}` : 'Defina a porcentagem'}</span>
        </div>
      </div>
      {s.necessario !== undefined && (
        <p className={`cartao ${s.necessario > s.aporte + 1 ? 'areia' : 'manter'} pequeno`}>
          {s.necessario > s.aporte + 1
            ? `Para chegar em ${mesCurto(plano.prazo!)}, separe ${reaisCurto(s.necessario)}/mês (${reaisCurto(s.necessario - s.aporte)} a mais). Veja o Feedback para achar esse valor.`
            : `No ritmo atual você chega antes de ${mesCurto(plano.prazo!)}.`}
        </p>
      )}

      <motion.button type="button" whileTap={{ scale: 0.97 }} className="botao" onClick={() => setDeposito(true)}>
        <Icone nome="mais" /> Guardei dinheiro neste plano
      </motion.button>

      <section className="cartao">
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>Composição da meta</h2>
        {(plano.composicao ?? res.composicao).map((c) => (
          <div key={c.rotulo} className="entre pequeno"><span>{c.rotulo}</span><strong className="num">{reaisCurto(c.valor)}</strong></div>
        ))}
      </section>

      {res.mensal && res.mensal.length > 0 && (
        <section className="cartao verde">
          <h2 style={{ fontSize: 15, fontWeight: 800 }}>{plano.tipo === 'casa' ? 'Custo por mês morando sozinha' : 'Custo por mês depois da compra'}</h2>
          {res.mensal.map((c) => (
            <div key={c.rotulo} className="entre pequeno"><span>{c.rotulo}</span><strong className="num">{reaisCurto(c.valor)}</strong></div>
          ))}
          <div className="entre"><strong>Total</strong><strong className="num">{reaisCurto(custoMensal)}/mês</strong></div>
          {renda.media > 0 && (
            <span className="suave pequeno">
              {plano.tipo === 'casa'
                ? `Equivale a ${pct((custoMensal / renda.media) * 100)} da sua renda média (${reaisCurto(renda.media)}).${custoMensal > renda.media ? ' Para fechar a conta: outro bairro, imóvel menor, dividir moradia ou aumentar a renda.' : ''}`
                : `Equivale a ${pct((custoMensal / renda.media) * 100)} da sua renda média. Recomendado: parcela de até 30% da renda.`}
            </span>
          )}
        </section>
      )}

      <section className="cartao">
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>Onde guardar este dinheiro</h2>
        <p className="pequeno suave">{rec.resumo}</p>
        {rec.opcoes.slice(0, 3).map((o) => (
          <div key={o.nome} className="coluna" style={{ gap: 2 }}>
            <strong className="pequeno">{o.nome}</strong>
            <span className="mini suave">{o.porque}</span>
          </div>
        ))}
        {rec.rendimentoAnualEstimado !== undefined && (
          <span className="pilula manter" style={{ whiteSpace: 'normal' }}>Rendimento estimado: {pct(rec.rendimentoAnualEstimado, 1)} ao ano, já sem IR</span>
        )}
        {ligados.length > 0 && <span className="mini suave">Investimentos ligados: {ligados.map((i) => `${i.nome} (${reaisCurto(i.saldo)})`).join(', ')}</span>}
        <Link to="/investir" className="botao secundario pequeno">Ver plano de investimentos</Link>
      </section>

      <section className="cartao grafite">
        <div className="linha">
          <span className="circulo terracota"><Icone nome="ia" /></span>
          <div className="coluna cresce" style={{ gap: 2 }}>
            <strong>Análise aprimorada com IA</strong>
            <span className="pequeno suave">Pesquisa preços e taxas atuais em fontes confiáveis. Envia só os números do plano.</span>
          </div>
        </div>
        <button type="button" className="botao terracota" onClick={analisar} disabled={carregandoIA || !online}>
          {carregandoIA ? 'Pesquisando… (pode levar 1 a 2 minutos)' : plano.analiseIA ? 'Atualizar análise' : online ? 'Fazer análise' : 'Precisa de internet'}
        </button>
        {erroIA && <p className="pequeno">{erroIA}</p>}
      </section>
      {plano.analiseIA && (
        <Entra>
          <section className="cartao">
            <span className="mini suave">Análise de {new Date(plano.analiseIA.geradaEm).toLocaleString('pt-BR')} · disponível offline</span>
            <Markdown texto={plano.analiseIA.texto} />
          </section>
        </Entra>
      )}

      <section className="cartao">
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>Onde pesquisar e comprar</h2>
        <div className="chips">
          {res.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'var(--texto)' }}>
              <Icone nome="link" tamanho={16} /> {l.rotulo}
            </a>
          ))}
        </div>
      </section>

      {res.notas.map((n) => <p key={n} className="cartao areia pequeno">{n}</p>)}
      {res.fontes.length > 0 && <p className="mini suave">Fontes: {res.fontes.join(' · ')}</p>}

      <button
        type="button"
        className="botao perigo"
        onClick={async () => {
          if (confirm(`Apagar o plano "${plano.nome}"? Isso não pode ser desfeito.`)) {
            await db.planos.delete(plano.id!);
            navegar('/planos', { replace: true });
          }
        }}
      >
        <Icone nome="lixo" /> Apagar plano
      </button>

      <Folha aberta={deposito} aoFechar={() => setDeposito(false)} titulo="Guardei dinheiro">
        <CampoDinheiro rotulo="Quanto você guardou?" valor={valorDep} aoMudar={setValorDep} dica={`Hoje: ${reais(plano.guardado)} fora dos investimentos.`} />
        <button
          type="button"
          className="botao"
          disabled={!valorDep}
          onClick={async () => {
            await db.planos.update(plano.id!, { guardado: plano.guardado + (valorDep ?? 0) });
            setValorDep(undefined);
            setDeposito(false);
          }}
        >
          Somar ao plano
        </button>
      </Folha>
    </main>
  );
}
