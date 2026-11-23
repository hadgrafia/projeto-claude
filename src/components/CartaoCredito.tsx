import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db, type Investimento, type Movimento, type Perfil } from '../db';
import { alertasCartao, estadoCartao } from '../lib/cartao';
import { mesLongo, reaisCurto } from '../lib/format';
import { Icone } from './Icone';

/** Resumo do cartão de crédito no Início: limite livre e fatura; vermelho quando o limite passa da renda. */
export function ResumoCartao({ perfil, movimentos, investimentos, renda }: { perfil?: Perfil; movimentos: Movimento[]; investimentos: Investimento[]; renda: number }) {
  const compras = useLiveQuery(() => db.compras.toArray(), []) ?? [];
  const e = useMemo(() => estadoCartao(perfil, compras, movimentos), [perfil, compras, movimentos]);
  if (!perfil) return null;
  const estilo = { gridColumn: '1 / -1', flexDirection: 'row' as const, alignItems: 'center' };
  if (!e.limite)
    return (
      <Link to="/cartao" className="cartao cartao-link" style={estilo}>
        <span className="circulo terracota"><Icone nome="cartao" /></span>
        <span className="cresce coluna" style={{ gap: 2 }}>
          <strong>Controle o cartão de crédito</strong>
          <span className="pequeno suave">Informe o limite: cada compra no crédito desconta dele e a fatura fica à vista.</span>
        </span>
        <Icone nome="direita" />
      </Link>
    );
  const al = alertasCartao(e, renda, investimentos.reduce((a, i) => a + i.saldo, 0));
  const fatura = e.faturas.find((f) => f.mes === e.aberta);
  const vermelho = al.limiteAcimaDaRenda || al.tirariaDosInvestimentos > 0;
  return (
    <Link to="/cartao" className={`cartao cartao-link ${vermelho ? 'alerta-vermelho' : ''}`} style={estilo}>
      <span className={`circulo ${vermelho ? '' : 'terracota'}`} style={vermelho ? { background: 'rgba(255,255,255,0.2)', color: '#fff' } : undefined}><Icone nome="cartao" /></span>
      <span className="cresce coluna" style={{ gap: 2 }}>
        <strong>Cartão: {reaisCurto(e.disponivel)} livres de {reaisCurto(e.limite)}</strong>
        <span className={`pequeno ${vermelho ? '' : 'suave'}`}>
          Fatura de {fatura ? mesLongo(fatura.mes) : ''}: {reaisCurto(fatura?.valor ?? 0)}
          {al.limiteAcimaDaRenda ? ' · Limite maior que a sua renda' : al.faturaAlta ? ' · Fatura alta' : ''}
        </span>
      </span>
      <Icone nome="direita" />
    </Link>
  );
}
