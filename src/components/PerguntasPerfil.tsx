import { useId } from 'react';
import { PERGUNTAS_PERFIL } from '../lib/invest';
import { Icone } from './Icone';

/** As 3 perguntas do perfil de investidor, cada uma inteira dentro do seu cartão. */
export function PerguntasPerfil({ respostas, aoResponder }: { respostas: (number | undefined)[]; aoResponder: (i: number, pontos: number) => void }) {
  const base = useId();
  return (
    <>
      {PERGUNTAS_PERFIL.map((p, i) => (
        <div key={p.id} className="cartao" role="radiogroup" aria-labelledby={`${base}-${i}`} style={{ gap: 12 }}>
          <div className="linha" style={{ alignItems: 'flex-start', gap: 10 }}>
            <span className="circulo verde" style={{ width: 28, height: 28, fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
            <h3 id={`${base}-${i}`} style={{ fontSize: 15, fontWeight: 700, margin: 0, lineHeight: 1.4 }}>{p.texto}</h3>
          </div>
          <div className="coluna">
            {p.opcoes.map((o) => {
              const marcado = respostas[i] === o.pontos;
              return (
                <button
                  key={o.rotulo}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  className="chip"
                  style={{ textAlign: 'left', minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: marcado ? 'var(--verde)' : 'var(--bg)', color: marcado ? 'var(--sobre-verde)' : 'var(--texto)', borderColor: marcado ? 'var(--verde)' : 'var(--borda)' }}
                  onClick={() => aoResponder(i, o.pontos)}
                >
                  {o.rotulo}
                  {marcado && <Icone nome="check" tamanho={18} />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
