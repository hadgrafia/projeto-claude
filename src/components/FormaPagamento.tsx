import { useState } from 'react';
import { db, type FormaPag, type Movimento } from '../db';
import { conferirLimiteCartao } from '../lib/avisos';
import { NOMES_FORMA } from '../lib/cartao';
import { BotaoSalvar } from './Ui';
import { BotaoNaoEraGasto } from './Lugar';
import { hora, reais } from '../lib/format';

const OPCOES: FormaPag[] = ['debito', 'pix', 'credito', 'dinheiro', 'boleto'];

/** Escolha de como foi pago; no crédito, também em quantas vezes. */
export function CampoForma({ forma, parcelas, aoMudar, rotulo = 'Como foi pago?' }: { forma?: FormaPag; parcelas?: number; aoMudar: (forma: FormaPag, parcelas?: number) => void; rotulo?: string }) {
  return (
    <div className="campo">
      {rotulo}
      <div className="chips" role="radiogroup" aria-label={rotulo}>
        {OPCOES.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={forma === f}
            className="chip"
            onClick={() => aoMudar(f, f === 'credito' ? parcelas ?? 1 : undefined)}
            style={forma === f ? { background: f === 'credito' ? 'var(--terracota)' : 'var(--verde)', color: '#fff' } : undefined}
          >
            {f === 'pix' ? 'Pix' : NOMES_FORMA[f]}
          </button>
        ))}
      </div>
      {forma === 'credito' && (
        <label className="campo" style={{ marginTop: 6 }}>
          Em quantas vezes?
          <select value={parcelas ?? 1} onChange={(e) => aoMudar('credito', Number(e.target.value))}>
            <option value={1}>À vista (1x)</option>
            {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}x</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

/** Pergunta "débito ou crédito?" para um gasto que chegou sem essa informação. */
export function FormForma({ mov, restantes, aoAdiar, segurar }: { mov: Movimento; restantes: number; aoAdiar: () => void; segurar?: (m?: Movimento) => void }) {
  const [forma, setForma] = useState<FormaPag>();
  const [parcelas, setParcelas] = useState(1);

  async function salvar() {
    if (!forma) return false;
    segurar?.(mov);
    await db.movimentos.update(mov.id!, { forma, parcelas: forma === 'credito' && parcelas > 1 ? parcelas : undefined, formaPendente: false });
    if (forma === 'credito') conferirLimiteCartao().catch(() => undefined);
  }

  return (
    <>
      <div className="cartao verde">
        <span className="suave pequeno">{mov.local ?? mov.descricao}{mov.avisadoPor ? ` · aviso do ${mov.avisadoPor}` : ''} · {hora(mov.data)}</span>
        <strong className="valor-grande" style={{ fontSize: 30 }}>{reais(mov.valor)}</strong>
        <span className="suave pequeno">O aviso não disse se foi no débito ou no crédito. No crédito, entra na fatura e desconta do limite do cartão.</span>
      </div>
      <CampoForma
        rotulo="Foi no débito ou no crédito?"
        forma={forma}
        parcelas={parcelas}
        aoMudar={(f, n) => {
          setForma(f);
          if (n) setParcelas(n);
        }}
      />
      {forma === 'credito' && parcelas > 1 && <span className="mini suave">{parcelas}x de {reais(mov.valor / parcelas)}. Se o valor do aviso já era o da parcela, corrija o valor no gasto depois.</span>}
      <BotaoSalvar disabled={!forma} aoSalvar={salvar} depois={() => segurar?.(undefined)} />
      <button type="button" className="botao secundario" onClick={aoAdiar}>Responder depois{restantes > 0 ? ` (${restantes} na fila)` : ''}</button>
      {mov.origem === 'notificacao' && <BotaoNaoEraGasto mov={mov} segurar={segurar} />}
    </>
  );
}
