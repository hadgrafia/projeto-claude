import { useState } from 'react';
import { explicarJuros } from '../lib/finance';
import { CampoDinheiro, Segmentado } from './Ui';

/**
 * Parcelamento sem pedir a taxa de juros (muitas lojas não mostram): a pessoa diz quanto vai pagar
 * no total com os juros, ou o valor de cada parcela, e o app explica quanto isso custa a mais.
 */
export interface Parcelamento {
  parcelas: number;
  comJuros: boolean;
  /** Total que vai pagar com os juros (só quando comJuros). */
  total?: number;
}

export function totalPago(p: Parcelamento, preco: number) {
  return p.comJuros && p.parcelas > 1 && p.total && p.total > 0 ? p.total : preco;
}

export function CampoParcelamento({
  preco,
  valor,
  aoMudar,
  maxParcelas = 24,
  rotuloParcelas = 'Em quantas vezes?',
  somenteComJuros = false,
}: {
  preco?: number;
  valor: Parcelamento;
  aoMudar: (v: Parcelamento) => void;
  maxParcelas?: number;
  rotuloParcelas?: string;
  /** Opção com juros oferecida pela loja (esconde a escolha "sem/com juros"). */
  somenteComJuros?: boolean;
}) {
  const [modo, setModo] = useState<'total' | 'parcela'>('total');
  const n = valor.parcelas;
  const total = valor.total;
  const explicacao = valor.comJuros && n > 1 && preco && total ? explicarJuros(preco, total, n) : n > 1 && preco && !valor.comJuros ? explicarJuros(preco, preco, n) : '';
  const caro = Boolean(valor.comJuros && preco && total && total > preco);
  return (
    <div className="coluna" style={{ gap: 10 }}>
      <label className="campo">
        {rotuloParcelas}
        <select value={n} onChange={(e) => aoMudar({ ...valor, parcelas: Number(e.target.value) })}>
          <option value={1}>À vista (1x)</option>
          {Array.from({ length: maxParcelas - 1 }, (_, i) => i + 2).map((k) => <option key={k} value={k}>{k}x</option>)}
        </select>
      </label>
      {n > 1 && !somenteComJuros && (
        <Segmentado
          rotulo="Tem juros?"
          valor={valor.comJuros ? 'com' : 'sem'}
          aoMudar={(v) => aoMudar({ ...valor, comJuros: v === 'com' })}
          opcoes={[
            { valor: 'sem', rotulo: 'Sem juros' },
            { valor: 'com', rotulo: 'Com juros' },
          ]}
        />
      )}
      {n > 1 && valor.comJuros && (
        <>
          <Segmentado
            rotulo="O que a loja mostra?"
            valor={modo}
            aoMudar={setModo}
            opcoes={[
              { valor: 'total', rotulo: 'O total a pagar' },
              { valor: 'parcela', rotulo: 'O valor da parcela' },
            ]}
          />
          {modo === 'total' ? (
            <CampoDinheiro
              rotulo={`Quanto você vai pagar no total, em ${n}x com juros?`}
              valor={total}
              aoMudar={(t) => aoMudar({ ...valor, total: t })}
              dica="Ex.: a compra de R$ 200 em 6x com juros sai por R$ 350. Veja no carrinho ou na simulação da loja."
            />
          ) : (
            <CampoDinheiro
              rotulo={`Quanto é cada parcela? (${n}x)`}
              valor={total ? Math.round((total / n) * 100) / 100 : undefined}
              aoMudar={(v) => aoMudar({ ...valor, total: v ? Math.round(v * n * 100) / 100 : undefined })}
              dica="Ex.: 6x de R$ 58,33. O app calcula o total e quanto você paga de juros."
            />
          )}
        </>
      )}
      {explicacao && (
        <div className={`cartao ${caro ? 'areia' : 'verde'}`} style={{ padding: 14, gap: 4 }} role="status">
          <strong className="pequeno">{caro ? 'Quanto custam os juros' : 'Sem juros'}</strong>
          <span className="pequeno">{explicacao}</span>
          {caro && <span className="mini">Se der para esperar e juntar, ou achar a opção sem juros, você economiza essa diferença.</span>}
        </div>
      )}
    </div>
  );
}
