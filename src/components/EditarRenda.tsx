import { useState } from 'react';
import { db, type Perfil, type Vinculo } from '../db';
import { NOMES_VINCULO, RENDA_VARIAVEL } from '../lib/finance';
import { reais } from '../lib/format';
import { BotaoSalvar, CampoDinheiro } from './Ui';

/** "Como você recebe?" — CLT, PJ, autônomo, servidor ou outro. */
export function CampoVinculo({ valor, aoMudar }: { valor?: Vinculo; aoMudar: (v: Vinculo) => void }) {
  return (
    <div className="campo">
      Como você recebe?
      <div className="chips" role="radiogroup" aria-label="Como você recebe">
        {(Object.keys(NOMES_VINCULO) as Vinculo[]).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={valor === v}
            className="chip"
            onClick={() => aoMudar(v)}
            style={valor === v ? { background: 'var(--verde)', color: 'var(--sobre-verde)' } : undefined}
          >
            {NOMES_VINCULO[v]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Ajustar como recebe, a renda (e o mês fraco, se variável) e o gasto estimado a qualquer momento. */
export function EditarRenda({ perfil, aoSalvar }: { perfil: Perfil; aoSalvar?: () => void }) {
  const [vinculo, setVinculo] = useState<Vinculo | undefined>(perfil.vinculo);
  const [renda, setRenda] = useState<number | undefined>(perfil.rendaMensal || undefined);
  const [minima, setMinima] = useState<number | undefined>(perfil.rendaMinima || undefined);
  const [gasto, setGasto] = useState<number | undefined>(perfil.gastoMensalEstimado || undefined);
  const variavel = Boolean(vinculo && RENDA_VARIAVEL.includes(vinculo));
  const ok = Boolean(renda && renda > 0 && gasto && gasto > 0 && (!variavel || (minima && minima > 0)));
  const base = renda ? (variavel && minima ? Math.round((renda + Math.min(renda, minima)) / 2) : renda) : 0;
  return (
    <div className="coluna" style={{ gap: 12 }}>
      <CampoVinculo valor={vinculo} aoMudar={setVinculo} />
      <CampoDinheiro
        rotulo={variavel ? 'Num mês normal, quanto entra? (média, depois dos impostos)' : 'Renda mensal (salário líquido mais recente)'}
        valor={renda}
        aoMudar={setRenda}
        dica={variavel ? 'Com 3 meses ou mais de entradas registradas, o app passa a usar a média real.' : 'Recebeu um valor diferente este mês? Atualize aqui: todos os planos são recalculados na hora.'}
      />
      {variavel && <CampoDinheiro rotulo="E num mês fraco, quanto entra?" valor={minima} aoMudar={setMinima} dica="O app planeja com o meio-termo entre a média e o mês fraco." />}
      <CampoDinheiro rotulo="Gasto mensal estimado" valor={gasto} aoMudar={setGasto} dica="Usado até haver gastos registrados suficientes." />
      {perfil.rendaAtualizadaEm && <span className="mini suave">Última atualização da renda: {new Date(perfil.rendaAtualizadaEm).toLocaleDateString('pt-BR')}</span>}
      {base && gasto ? (
        <span className="pequeno">
          {variavel ? <>Renda usada nos planos: <strong>{reais(base)}</strong> · </> : null}
          Sobra por mês: <strong>{reais(Math.max(0, base - gasto))}</strong>
        </span>
      ) : null}
      <BotaoSalvar
        disabled={!ok}
        aoSalvar={() =>
          db.perfil.update('eu', {
            vinculo,
            rendaMensal: renda!,
            rendaMinima: variavel ? minima : undefined,
            gastoMensalEstimado: gasto!,
            rendaAtualizadaEm: new Date().toISOString(),
          })
        }
        depois={aoSalvar}
      />
    </div>
  );
}
