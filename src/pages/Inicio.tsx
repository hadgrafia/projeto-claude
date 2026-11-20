import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Icone, ICONE_PLANO } from '../components/Icone';
import { Barra, Casa, Dinheiro, Entra } from '../components/Ui';
import { situacaoPlano, useDados, useSelic } from '../hooks';
import { analisarMes } from '../lib/feedback';
import { mesCurto, pct, reaisCurto } from '../lib/format';

const saudacao = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};

export default function Inicio() {
  const { perfil, planos, investimentos, movimentos, renda, gasto, livre, somaPct } = useDados();
  const selic = useSelic();
  const situacoes = planos.map((p) => ({ p, s: situacaoPlano(p, investimentos, livre, selic?.valor) }));
  const totalGuardado = situacoes.reduce((a, x) => a + x.s.guardado, 0);
  const totalMeta = planos.reduce((a, p) => a + p.meta, 0);
  const sugestoes = analisarMes(movimentos, renda.media).filter((s) => s.status !== 'manter');
  const ganho = sugestoes.reduce((a, s) => a + s.ganhoMensal, 0);
  const maxRenda = Math.max(1, ...renda.meses.map((m) => m.valor));

  return (
    <main className="tela">
      <div className="topo">
        <div className="coluna" style={{ gap: 2 }}>
          <span className="subtitulo">{saudacao()}{perfil?.nome ? `, ${perfil.nome}` : ''}</span>
          <strong style={{ fontSize: 20, fontWeight: 800 }}>Seus planos</strong>
        </div>
        <Link to="/ajustes" className="circulo card" aria-label="Ajustes">
          <Icone nome="engrenagem" tamanho={20} />
        </Link>
      </div>

      <Entra>
        <section className="cartao verde">
          <div className="linha" style={{ alignItems: 'center' }}>
            <div className="coluna cresce" style={{ gap: 6 }}>
              <span className="suave pequeno">Guardado em todos os planos</span>
              <Dinheiro valor={totalGuardado} className="valor-grande" />
              <span className="suave pequeno">de {reaisCurto(totalMeta)}</span>
            </div>
            <span style={{ color: 'var(--sobre-verde)' }}>
              <Casa pct={totalMeta ? (totalGuardado / totalMeta) * 100 : 0} tamanho={96} />
            </span>
          </div>
          <div className="chips">
            <span className="pilula verde">{planos.length} {planos.length === 1 ? 'plano' : 'planos'}</span>
            <span className="pilula terracota">{reaisCurto(livre)}/mês livres</span>
          </div>
        </section>
      </Entra>

      {planos.length === 0 ? (
        <Entra i={1}>
          <Link to="/planos/novo" className="cartao cartao-link" style={{ border: '2px dashed var(--borda)', background: 'transparent', flexDirection: 'row', alignItems: 'center' }}>
            <span className="circulo terracota"><Icone nome="mais" /></span>
            <span className="coluna" style={{ gap: 2 }}>
              <strong>Criar meu primeiro plano</strong>
              <span className="pequeno suave">Casa nova, carro, equipamentos, viagem…</span>
            </span>
          </Link>
        </Entra>
      ) : (
        <div className="grade-2">
          {situacoes.map(({ p, s }, i) => (
            <Entra key={p.id} i={i + 1}>
              <motion.div whileTap={{ scale: 0.97 }}>
                <Link to={`/planos/${p.id}`} className={`cartao cartao-link ${i === 0 ? 'terracota' : ''}`} style={{ height: '100%' }}>
                  <Icone nome={ICONE_PLANO[p.tipo]} tamanho={26} cor={i === 0 ? '#fff' : 'var(--terracota-texto)'} />
                  <span className="pequeno" style={{ fontWeight: 600 }}>{p.nome}</span>
                  <Dinheiro valor={s.guardado} className="num" />
                  <span className="mini suave">de {reaisCurto(p.meta)} · {pct(s.pct)}</span>
                  <Barra pct={s.pct} rotulo={`Progresso de ${p.nome}`} />
                  <span className="mini suave">{s.previsao ? `Previsão ${mesCurto(s.previsao)}` : 'Defina quanto separar'}</span>
                </Link>
              </motion.div>
            </Entra>
          ))}
        </div>
      )}

      {somaPct > 100 && (
        <Link to="/planos" className="cartao areia cartao-link pequeno">
          A soma das porcentagens dos planos passou de 100% ({pct(somaPct)}). Ajuste em Planos.
        </Link>
      )}

      <Entra i={4}>
        <section className="cartao">
          <div className="entre">
            <span className="pequeno suave" style={{ fontWeight: 600 }}>Renda média · últimos 6 meses</span>
            <Dinheiro valor={renda.media} className="num" />
          </div>
          {renda.meses.length > 0 && (
            <div className="linha" style={{ alignItems: 'flex-end', height: 56, gap: 8 }} role="img" aria-label={`Renda variou de ${reaisCurto(renda.minimo)} a ${reaisCurto(renda.maximo)}`}>
              {renda.meses.map((m, i) => (
                <div key={m.mes} className="coluna cresce" style={{ alignItems: 'center', gap: 4 }}>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: (m.valor / maxRenda) * 40 }}
                    transition={{ duration: 0.7, delay: 0.2 + i * 0.06 }}
                    style={{ width: '100%', borderRadius: 8, background: i === renda.meses.length - 1 ? 'var(--terracota)' : 'var(--verde)' }}
                  />
                  <span className="mini suave">{mesCurto(m.mes).split('/')[0]}</span>
                </div>
              ))}
            </div>
          )}
          <span className="mini suave">
            Gasto típico {reaisCurto(gasto)}/mês. Sobra para os planos: <strong>{reaisCurto(livre)}</strong>.
          </span>
        </section>
      </Entra>

      {sugestoes.length > 0 && (
        <Entra i={5}>
          <Link to="/feedback" className="cartao grafite cartao-link" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <span className="circulo terracota"><Icone nome="lampada" /></span>
            <span className="cresce pequeno" style={{ fontSize: 14 }}>
              <strong>{sugestoes.length} {sugestoes.length === 1 ? 'sugestão' : 'sugestões'}</strong> podem liberar {reaisCurto(ganho)}/mês para seus planos
            </span>
          </Link>
        </Entra>
      )}

      <Entra i={6}>
        <Link to="/gastos" className="cartao cartao-link" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <span className="circulo manter"><Icone nome="lista" /></span>
          <span className="cresce coluna" style={{ gap: 2 }}>
            <strong>{movimentos.length} lançamentos registrados</strong>
            <span className="pequeno suave">Envie o extrato ou anote um gasto</span>
          </span>
          <Icone nome="direita" />
        </Link>
      </Entra>
    </main>
  );
}
