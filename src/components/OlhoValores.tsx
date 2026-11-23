import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { definirValoresOcultos, valoresOcultos } from '../lib/format';

/** Estado do olho, igual em todas as telas (muda junto quando a pessoa toca em qualquer olho). */
export function useValoresOcultos() {
  const [oculto, setOculto] = useState(valoresOcultos());
  useEffect(() => {
    const ouvir = (e: Event) => setOculto(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener('mp-valores-ocultos', ouvir);
    return () => window.removeEventListener('mp-valores-ocultos', ouvir);
  }, []);
  return oculto;
}

/**
 * O olho da marca: traço arredondado em grafite/areia e a íris em terracota.
 * Aberto: todos os valores aparecem. Fechado: a pálpebra desce, os cílios aparecem
 * e todos os valores em reais viram "R$ ••••".
 */
export function IconeOlho({ fechado, tamanho = 22 }: { fechado: boolean; tamanho?: number }) {
  const t = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <AnimatePresence initial={false} mode="wait">
        {fechado ? (
          <motion.g key="fechado" initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={t}>
            <path d="M2.5 10.5C5 14 8.3 15.8 12 15.8s7-1.8 9.5-5.3" />
            <path d="M5.4 13.6 4 15.6M9.2 15.4l-.6 2.4M14.8 15.4l.6 2.4M18.6 13.6l1.4 2" />
          </motion.g>
        ) : (
          <motion.g key="aberto" initial={{ opacity: 0, scaleY: 0.3 }} animate={{ opacity: 1, scaleY: 1 }} exit={{ opacity: 0, scaleY: 0.3 }} transition={t} style={{ transformOrigin: '12px 12px' }}>
            <path d="M2.5 12C5 7.6 8.3 5.4 12 5.4s7 2.2 9.5 6.6c-2.5 4.4-5.8 6.6-9.5 6.6S5 16.4 2.5 12z" />
            <circle cx="12" cy="12" r="3.3" fill="#B4552D" stroke="#B4552D" />
            <circle cx="13.2" cy="10.9" r="0.9" fill="#F0EBE1" stroke="none" />
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
  );
}

/** Botão do olho: mostra ou esconde todos os valores do app. */
export function BotaoOlho({ className = 'circulo card', comRotulo = false }: { className?: string; comRotulo?: boolean }) {
  const oculto = useValoresOcultos();
  const rotulo = oculto ? 'Mostrar valores' : 'Esconder valores';
  return (
    <button
      type="button"
      className={`${className} botao-olho ${oculto ? 'fechado' : ''}`}
      aria-label={rotulo}
      aria-pressed={oculto}
      title={rotulo}
      onClick={() => definirValoresOcultos(!oculto)}
    >
      <IconeOlho fechado={oculto} />
      {comRotulo && <span className="rotulo">{oculto ? 'Valores ocultos' : 'Valores visíveis'}</span>}
    </button>
  );
}
