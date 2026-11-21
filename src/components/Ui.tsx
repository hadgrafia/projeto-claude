import { animate, AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { reais, reaisCurto } from '../lib/format';
import { Icone } from './Icone';

/** Número que "conta" até o valor final. */
export function Dinheiro({ valor, centavos = false, className }: { valor: number; centavos?: boolean; className?: string }) {
  const mv = useMotionValue(0);
  const texto = useTransform(mv, (v) => (centavos ? reais(v) : reaisCurto(v)));
  useEffect(() => {
    const c = animate(mv, valor, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return c.stop;
  }, [valor, mv]);
  return (
    <motion.span className={`num ${className ?? ''}`} aria-label={centavos ? reais(valor) : reaisCurto(valor)}>
      {texto}
    </motion.span>
  );
}

export function Barra({ pct, rotulo }: { pct: number; rotulo?: string }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className="barra" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={rotulo}>
      <motion.div initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.1 }} />
    </div>
  );
}

/** Casinha que se enche conforme o progresso. */
export function Casa({ pct, tamanho = 112 }: { pct: number; tamanho?: number }) {
  const id = useId();
  const h = (156 * Math.max(0, Math.min(100, pct))) / 100;
  return (
    <svg className="casa-svg" width={tamanho} height={tamanho} viewBox="0 0 200 200" role="img" aria-label={`Meta ${Math.round(pct)}% concluída`}>
      <defs>
        <clipPath id={id}>
          <path d="M20 92 L100 24 L180 92 V180 H20 Z" />
        </clipPath>
      </defs>
      <path d="M20 92 L100 24 L180 92 V180 H20 Z" fill="rgba(255,255,255,0.18)" />
      <motion.rect
        x={0}
        width={200}
        clipPath={`url(#${id})`}
        fill="#D9774F"
        initial={{ y: 180, height: 0 }}
        animate={{ y: 180 - h, height: h }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
      />
      <path d="M20 92 L100 24 L180 92 V180 H20 Z" fill="none" stroke="currentColor" strokeWidth={7} strokeLinejoin="round" />
      <rect x={84} y={128} width={32} height={52} rx={5} fill="none" stroke="currentColor" strokeWidth={6} />
    </svg>
  );
}

export function Segmentado<T extends string>({ opcoes, valor, aoMudar, rotulo }: { opcoes: { valor: T; rotulo: string }[]; valor: T; aoMudar: (v: T) => void; rotulo: string }) {
  const id = useId();
  return (
    <div className="segmentado" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" aria-pressed={valor === o.valor} onClick={() => aoMudar(o.valor)}>
          {valor === o.valor && <motion.div layoutId={`seg-${id}`} className="marcador" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span>{o.rotulo}</span>
        </button>
      ))}
    </div>
  );
}

export function Folha({ aberta, aoFechar, titulo, children }: { aberta: boolean; aoFechar: () => void; titulo: string; children: ReactNode }) {
  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberta, aoFechar]);
  return (
    <AnimatePresence>
      {aberta && (
        <>
          <motion.div className="folha-fundo" onClick={aoFechar} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            className="folha"
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="alca" />
            <div className="topo">
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>{titulo}</h2>
              <button type="button" className="circulo card" onClick={aoFechar} aria-label="Fechar">
                <span style={{ display: 'inline-flex', transform: 'rotate(45deg)' }}><Icone nome="mais" tamanho={20} /></span>
              </button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Entrada de dinheiro que aceita "1.234,56". */
export function CampoDinheiro({ rotulo, valor, aoMudar, dica }: { rotulo: string; valor: number | undefined; aoMudar: (v: number | undefined) => void; dica?: string }) {
  const [txt, setTxt] = useState(valor ? valor.toLocaleString('pt-BR') : '');
  useEffect(() => {
    setTxt((atual) => {
      const n = parseFloat(atual.replace(/\./g, '').replace(',', '.'));
      return n === valor ? atual : valor ? valor.toLocaleString('pt-BR') : '';
    });
  }, [valor]);
  return (
    <label className="campo">
      {rotulo}
      <div className="com-sufixo">
        <input
          inputMode="decimal"
          placeholder="R$ 0,00"
          value={txt}
          onChange={(e) => {
            const s = e.target.value.replace(/[^\d.,]/g, '');
            setTxt(s);
            const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
            aoMudar(Number.isFinite(n) ? n : undefined);
          }}
        />
        <span>R$</span>
      </div>
      {dica && <span className="dica">{dica}</span>}
    </label>
  );
}

/** Animação de entrada em sequência para listas e cartões. */
export const Entra = ({ children, i = 0, largo }: { children: ReactNode; i?: number; largo?: boolean }) => (
  <motion.div style={largo ? { gridColumn: '1 / -1' } : undefined} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.05, ease: 'easeOut' }}>
    {children}
  </motion.div>
);

/** Markdown simples (títulos, listas, negrito, links, tabelas) sem HTML bruto. */
export function Markdown({ texto }: { texto: string }) {
  const linhas = texto.split('\n');
  const blocos: ReactNode[] = [];
  const inline = (s: string, k: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g).map((p, i) => {
      if (p.startsWith('**')) return <strong key={k + i}>{p.slice(2, -2)}</strong>;
      const m = p.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (m) return <a key={k + i} href={m[2]} target="_blank" rel="noopener noreferrer">{m[1]}</a>;
      return p;
    });
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (!l) continue;
    if (l.startsWith('#')) blocos.push(<h2 key={i}>{inline(l.replace(/^#+\s*/, ''), `h${i}`)}</h2>);
    else if (/^[-*]\s/.test(l)) {
      const itens: string[] = [];
      while (i < linhas.length && /^[-*]\s/.test(linhas[i].trim())) itens.push(linhas[i++].trim().slice(2));
      i--;
      blocos.push(<ul key={i}>{itens.map((t, j) => <li key={j}>{inline(t, `l${i}-${j}`)}</li>)}</ul>);
    } else if (l.startsWith('|')) {
      const rows: string[][] = [];
      while (i < linhas.length && linhas[i].trim().startsWith('|')) {
        const cells = linhas[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      blocos.push(
        <table key={i}>
          <tbody>{rows.map((r, j) => <tr key={j}>{r.map((c, k) => (j === 0 ? <th key={k}>{inline(c, `t${i}${j}${k}`)}</th> : <td key={k}>{inline(c, `t${i}${j}${k}`)}</td>))}</tr>)}</tbody>
        </table>,
      );
    } else blocos.push(<p key={i}>{inline(l, `p${i}`)}</p>);
  }
  return <div className="markdown">{blocos}</div>;
}
