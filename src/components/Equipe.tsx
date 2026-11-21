import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db';
import { situacaoPlano, useDados, useSelic } from '../hooks';
import { AGENTES, montarContexto, type IdAgente, type Situacao } from '../lib/agentes';
import { destaques } from '../lib/agentesAvisos';

/** Dados da equipe: contexto para a IA e destaques do painel, sempre atualizados. */
export function useEquipe() {
  const dados = useDados();
  const selic = useSelic();
  const compras = useLiveQuery(() => db.compras.toArray(), []) ?? [];
  return useMemo(() => {
    const situacoes = new Map<number, Situacao>();
    for (const p of dados.planos) {
      const s = situacaoPlano(p, dados.investimentos, dados.livre, selic?.valor);
      situacoes.set(p.id!, { guardado: s.guardado, aporte: s.aporte, pct: s.pct, previsao: s.previsao, meses: s.meses, prazoMeses: s.prazoMeses });
    }
    const base = { perfil: dados.perfil, planos: dados.planos, movimentos: dados.movimentos, investimentos: dados.investimentos, compras, renda: dados.renda.mensal, gasto: dados.gasto, livre: dados.livre, selic: selic?.valor, situacoes };
    return { ...dados, compras, selic: selic?.valor, contexto: () => montarContexto(base), destaques: destaques(base) };
  }, [dados, compras, selic]);
}

export function Avatar({ id, tamanho = 36 }: { id: IdAgente; tamanho?: number }) {
  const a = AGENTES[id];
  return (
    <span className="avatar-agente" style={{ width: tamanho, height: tamanho, background: a.cor, fontSize: tamanho * 0.42 }} aria-hidden="true">
      {a.nome[0]}
    </span>
  );
}

/** Painel com o que cada agente tem a dizer agora. */
export function PainelAgentes({ compacto = false }: { compacto?: boolean }) {
  const { destaques: lista, perfil } = useEquipe();
  if (compacto && perfil?.avisos?.agentes === false) return null;
  if (!lista.length) return compacto ? null : <p className="pequeno suave">Tudo em dia: nenhum alerta dos agentes agora.</p>;
  return (
    <section className="cartao" style={{ gridColumn: '1 / -1', gap: 10 }}>
      <div className="entre">
        <strong>Recados da equipe</strong>
        {compacto && <Link to="/agentes" className="pequeno">Conversar</Link>}
      </div>
      {lista.slice(0, compacto ? 3 : 10).map((d) => (
        <Link key={d.chave} to={d.link ?? '/agentes'} className="linha recado" style={{ alignItems: 'flex-start', textDecoration: 'none', color: 'var(--texto)' }}>
          <Avatar id={d.agente} tamanho={32} />
          <span className="coluna" style={{ gap: 2 }}>
            <strong className="pequeno">{AGENTES[d.agente].nome}</strong>
            <span className="pequeno suave">{d.texto}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}
