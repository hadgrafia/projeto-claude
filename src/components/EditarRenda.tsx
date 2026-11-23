import { useState } from 'react';
import { db, type Perfil } from '../db';
import { reais } from '../lib/format';
import { BotaoSalvar, CampoDinheiro } from './Ui';

/** Ajustar a renda mensal (salário mais recente) e o gasto estimado a qualquer momento. */
export function EditarRenda({ perfil, aoSalvar }: { perfil: Perfil; aoSalvar?: () => void }) {
  const [renda, setRenda] = useState<number | undefined>(perfil.rendaMensal || undefined);
  const [gasto, setGasto] = useState<number | undefined>(perfil.gastoMensalEstimado || undefined);
  const ok = Boolean(renda && renda > 0 && gasto && gasto > 0);
  return (
    <div className="coluna" style={{ gap: 12 }}>
      <CampoDinheiro rotulo="Renda mensal (salário mais recente)" valor={renda} aoMudar={setRenda} dica="Recebeu um valor diferente este mês? Atualize aqui: todos os planos são recalculados na hora." />
      <CampoDinheiro rotulo="Gasto mensal estimado" valor={gasto} aoMudar={setGasto} dica="Usado até haver gastos registrados suficientes." />
      {perfil.rendaAtualizadaEm && <span className="mini suave">Última atualização da renda: {new Date(perfil.rendaAtualizadaEm).toLocaleDateString('pt-BR')}</span>}
      {renda && gasto ? <span className="pequeno">Sobra por mês: <strong>{reais(Math.max(0, renda - gasto))}</strong></span> : null}
      <BotaoSalvar
        disabled={!ok}
        aoSalvar={() => db.perfil.update('eu', { rendaMensal: renda!, gastoMensalEstimado: gasto!, rendaAtualizadaEm: new Date().toISOString() })}
        depois={aoSalvar}
      />
    </div>
  );
}
