import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { AnalisePrazo } from '../lib/finance';
import { mesCurto, pct, reaisCurto } from '../lib/format';
import { Icone } from './Icone';

/**
 * Data desejada x data realmente possível, com base na renda mensal, nos gastos e no rendimento.
 * Recalcula sozinho sempre que a renda, os gastos, os investimentos ou a porcentagem mudam.
 */
export function CartaoPrazo({
  a,
  prazo,
  percentual,
  renda,
  gasto,
  rendimentoAa,
  aoUsarPct,
  aoUsarData,
}: {
  a: AnalisePrazo;
  prazo?: string;
  percentual: number;
  renda: number;
  gasto: number;
  rendimentoAa: number;
  aoUsarPct?: (p: number) => void;
  aoUsarData?: (mes: string) => void;
}) {
  const cor = a.situacao === 'ok' ? 'manter' : a.situacao === 'impossivel' ? 'terracota' : a.situacao === 'ajustar' ? 'areia' : '';
  const pctAlvo = a.pctNecessario !== undefined && Number.isFinite(a.pctNecessario) ? Math.min(100, Math.ceil(a.pctNecessario)) : undefined;
  return (
    <motion.section layout className={`cartao ${cor}`} aria-live="polite">
      <strong style={{ fontSize: 15 }}>Quando dá para chegar</strong>
      <div className="grade-2">
        <div className="coluna" style={{ gap: 0 }}>
          <span className="mini" style={{ opacity: 0.85 }}>Você deseja</span>
          <strong style={{ fontSize: 18 }}>{prazo ? mesCurto(prazo) : '—'}</strong>
        </div>
        <div className="coluna" style={{ gap: 0 }}>
          <span className="mini" style={{ opacity: 0.85 }}>Possível com {pct(percentual)} do livre</span>
          <strong style={{ fontSize: 18 }}>{a.dataAtual ? mesCurto(a.dataAtual) : 'sem previsão'}</strong>
        </div>
      </div>

      {a.situacao === 'sem-prazo' && <p className="pequeno">Informe quando você quer atingir a meta para comparar com a data possível.</p>}
      {a.situacao === 'ok' && (
        <p className="pequeno">
          <Icone nome="check" tamanho={16} /> Separando {reaisCurto(a.aporteAtual)}/mês você chega dentro do prazo.
        </p>
      )}
      {a.situacao === 'ajustar' && (
        <>
          <p className="pequeno">
            Para chegar em {mesCurto(prazo!)}, separe <strong>{reaisCurto(a.necessario!)}/mês</strong> ({pct(a.pctNecessario!)} do seu valor livre). Hoje são {reaisCurto(a.aporteAtual)}.
          </p>
          {aoUsarPct && pctAlvo !== undefined && (
            <button type="button" className="botao pequeno" onClick={() => aoUsarPct(pctAlvo)}>Usar {pct(pctAlvo)} neste plano</button>
          )}
        </>
      )}
      {a.situacao === 'impossivel' && (
        <>
          <p className="pequeno">
            Com a sua renda e os seus gastos de hoje, mesmo colocando todo o valor livre neste plano, a data mais próxima é <strong>{a.dataMinima ? mesCurto(a.dataMinima) : 'indefinida'}</strong>. Para chegar em {mesCurto(prazo!)}, faltam <strong>{reaisCurto(a.faltaPorMes!)}/mês</strong>.
          </p>
          <p className="mini">Caminhos: cortar gastos (a aba Conselhos mostra onde), aumentar a renda, reduzir a meta ou mudar a data.</p>
          <div className="grade-2">
            {aoUsarData && a.dataMinima && (
              <button type="button" className="botao secundario pequeno" onClick={() => aoUsarData(a.dataMinima!)}>Usar {mesCurto(a.dataMinima)}</button>
            )}
            <Link to="/feedback" className="botao secundario pequeno">Onde economizar</Link>
          </div>
        </>
      )}
      <span className="mini" style={{ opacity: 0.8 }}>
        Calculado com renda de {reaisCurto(renda)}, gastos de {reaisCurto(gasto)}/mês{rendimentoAa > 0 ? ` e rendimento de ${pct(rendimentoAa, 1)} ao ano` : ''}. Atualiza sozinho quando algo muda.
      </span>
    </motion.section>
  );
}
