import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Icone, ICONE_PLANO } from '../components/Icone';
import { Barra, Dinheiro, Entra } from '../components/Ui';
import { db } from '../db';
import { situacaoPlano, useDados, useSelic } from '../hooks';
import { mesCurto, pct, reaisCurto } from '../lib/format';

const CORES = ['#B4552D', '#3B4A3A', '#D9774F', '#8A9A86', '#6B4E3D', '#C9CFC0'];

export default function Planos() {
  const { planos, investimentos, livre, somaPct } = useDados();
  const selic = useSelic();

  async function mudarPct(id: number, v: number) {
    await db.planos.update(id, { percentual: Math.max(0, Math.min(100, v)) });
  }

  return (
    <main className="tela">
      <div className="topo">
        <h1 className="titulo">Meus planos</h1>
        <Link to="/planos/novo" className="circulo terracota" aria-label="Criar novo plano"><Icone nome="mais" /></Link>
      </div>

      <section className="cartao verde">
        <div className="entre">
          <span className="suave pequeno">Livre por mês para os planos</span>
          <Dinheiro valor={livre} className="num" />
        </div>
        <div className="linha" style={{ height: 12, borderRadius: 999, overflow: 'hidden', gap: 3 }} role="img" aria-label="Divisão por porcentagem fixa">
          {planos.map((p, i) => (
            <motion.div key={p.id} initial={{ width: 0 }} animate={{ width: `${Math.min(100, p.percentual)}%` }} transition={{ duration: 0.8 }} style={{ height: '100%', background: CORES[i % CORES.length] }} />
          ))}
          {somaPct < 100 && <div style={{ flex: 1, height: '100%', background: 'var(--verde-2)' }} />}
        </div>
        <span className="mini suave">
          {somaPct > 100
            ? `As porcentagens somam ${pct(somaPct)}: reduza para no máximo 100%.`
            : `${pct(somaPct)} dividido entre os planos · ${pct(100 - somaPct)} livre (${reaisCurto((livre * (100 - somaPct)) / 100)}).`}
        </span>
      </section>

      {planos.length === 0 && (
        <div className="vazio">
          <p>Nenhum plano ainda.</p>
          <Link to="/planos/novo" className="botao" style={{ marginTop: 12 }}>Criar plano</Link>
        </div>
      )}

      {planos.map((p, i) => {
        const s = situacaoPlano(p, investimentos, livre, selic?.valor);
        return (
          <Entra key={p.id} i={i}>
            <div className="cartao">
              <Link to={`/planos/${p.id}`} className="cartao-link coluna" style={{ gap: 10 }}>
                <div className="linha">
                  <span className="circulo" style={{ background: CORES[i % CORES.length], color: '#fff' }}><Icone nome={ICONE_PLANO[p.tipo]} /></span>
                  <span className="cresce coluna" style={{ gap: 2 }}>
                    <strong>{p.nome}</strong>
                    <span className="pequeno suave">
                      {reaisCurto(s.aporte)}/mês · {s.previsao ? `previsão ${mesCurto(s.previsao)}` : 'sem previsão'}
                    </span>
                  </span>
                  <Icone nome="direita" />
                </div>
                <div className="entre pequeno"><Dinheiro valor={s.guardado} /><span className="suave">de {reaisCurto(p.meta)}</span></div>
                <Barra pct={s.pct} rotulo={`Progresso de ${p.nome}`} />
              </Link>
              <label className="campo" style={{ fontWeight: 600 }}>
                <span className="entre"><span>Porcentagem fixa do valor livre</span><strong>{pct(p.percentual)}</strong></span>
                <input type="range" min={0} max={100} step={5} value={p.percentual} onChange={(e) => mudarPct(p.id!, Number(e.target.value))} style={{ minHeight: 32, padding: 0, accentColor: 'var(--terracota)' }} />
              </label>
              {s.necessario !== undefined && s.necessario > s.aporte + 1 && (
                <span className="pilula rever" style={{ whiteSpace: 'normal' }}>
                  Para cumprir o prazo ({mesCurto(p.prazo!)}): {reaisCurto(s.necessario)}/mês
                </span>
              )}
            </div>
          </Entra>
        );
      })}
    </main>
  );
}
