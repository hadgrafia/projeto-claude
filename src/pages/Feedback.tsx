import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icone } from '../components/Icone';
import { Dinheiro, Entra } from '../components/Ui';
import { situacaoPlano, useDados, useSelic } from '../hooks';
import { analisarMes } from '../lib/feedback';
import { mesCurto, mesLongo, chaveMes, reais, reaisCurto } from '../lib/format';
import { mesesParaMeta, previsao, taxaMensal } from '../lib/finance';

const ROTULO = { cortar: 'Cortar', rever: 'Rever', manter: 'Manter' } as const;

export default function Feedback() {
  const { movimentos, renda, planos, investimentos, livre } = useDados();
  const selic = useSelic();
  const sugestoes = analisarMes(movimentos, renda.media);
  const acoes = sugestoes.filter((s) => s.status !== 'manter');
  const manter = sugestoes.filter((s) => s.status === 'manter');
  const ganho = acoes.reduce((a, s) => a + s.ganhoMensal, 0);
  const [aplicado, setAplicado] = useState(false);
  const mesAtual = chaveMes(new Date());

  const impactos = planos.map((p) => {
    const s = situacaoPlano(p, investimentos, livre, selic?.valor);
    const r = taxaMensal(s.rendimentoAa);
    const novo = mesesParaMeta(p.meta, s.guardado, ((livre + ganho) * p.percentual) / 100, r);
    return { p, antes: s.previsao, depois: previsao(novo) };
  });

  return (
    <main className="tela">
      <div className="coluna" style={{ gap: 2 }}>
        <h1 className="titulo">Feedback de {mesLongo(mesAtual)}</h1>
        <span className="subtitulo">{movimentos.filter((m) => m.data.startsWith(mesAtual)).length} lançamentos analisados neste mês</span>
      </div>

      {sugestoes.length === 0 ? (
        <div className="cartao vazio">
          <p>Ainda não há gastos deste mês para analisar.</p>
          <Link to="/importar" className="botao" style={{ marginTop: 12 }}>Enviar extrato</Link>
        </div>
      ) : (
        <Entra>
          <section className="cartao verde">
            <span className="suave pequeno">Aplicando as {acoes.length} sugestões</span>
            <span className="valor-grande">+<Dinheiro valor={ganho} />/mês</span>
            {impactos.filter((x) => x.antes !== x.depois && x.depois).map((x) => (
              <div key={x.p.id} className="linha pequeno" style={{ flexWrap: 'wrap', gap: 8 }}>
                <span className="suave">{x.p.nome}:</span>
                <span className="pilula verde">{x.antes ? mesCurto(x.antes) : 'sem data'}</span>
                <Icone nome="seta" tamanho={16} />
                <span className="pilula terracota">{mesCurto(x.depois!)}</span>
              </div>
            ))}
          </section>
        </Entra>
      )}

      {acoes.map((s, i) => (
        <Entra key={s.categoria} i={i + 1}>
          <motion.article layout className="cartao">
            <div className="entre" style={{ alignItems: 'center' }}>
              <span className={`pilula ${s.status}`}>{ROTULO[s.status]}</span>
              <strong className="num">{reais(s.atual)}</strong>
            </div>
            <strong style={{ fontSize: 16 }}>{s.categoria}</strong>
            <p className="pequeno suave">{s.texto} Limite sugerido: {reaisCurto(s.limite)}/mês.</p>
            <strong className="pequeno" style={{ color: 'var(--manter-tx)' }}>+{reaisCurto(s.ganhoMensal)}/mês para os planos</strong>
          </motion.article>
        </Entra>
      ))}

      {manter.length > 0 && (
        <Entra i={acoes.length + 1}>
          <article className="cartao manter">
            <span className="pilula verde" style={{ alignSelf: 'flex-start' }}>Manter</span>
            <strong>{manter.map((s) => s.categoria).join(', ')}</strong>
            <p className="pequeno">Dentro do previsto. Total: {reais(manter.reduce((a, s) => a + s.atual, 0))}.</p>
          </article>
        </Entra>
      )}

      {acoes.length > 0 && (
        <motion.button type="button" whileTap={{ scale: 0.97 }} className="botao seta" onClick={() => setAplicado(true)}>
          {aplicado ? 'Limites anotados!' : 'Vou seguir os limites sugeridos'}
          <motion.span className="ponta" animate={aplicado ? { rotate: 360 } : {}} transition={{ duration: 0.5 }}>
            <Icone nome={aplicado ? 'check' : 'seta'} />
          </motion.span>
        </motion.button>
      )}
      {aplicado && <p className="cartao areia pequeno">Dica: quando o dinheiro entrar, já transfira {reaisCurto(livre + ganho)} para os cofrinhos dos planos. O que fica na conta corrente tende a ser gasto.</p>}
    </main>
  );
}
