/** Logo do app (sem texto): casa com barras subindo; a última vira uma seta que atravessa o telhado. */
export function Logo({ tamanho = 48, fundo = true }: { tamanho?: number; fundo?: boolean }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox={fundo ? '0 0 512 512' : '-25 -22 562 562'} role="img" aria-label="Meus Planos Financeiros">
      {fundo && <rect width="512" height="512" rx="116" fill="#3B4A3A" />}
      <path d="M108 240 L256 124 L404 240" fill="none" stroke="#F0EBE1" strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M144 218 V394 H368 V218" fill="none" stroke="#F0EBE1" strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" />
      <rect x="186" y="306" width="38" height="66" rx="11" fill="#F0EBE1" opacity="0.5" />
      <rect x="236" y="262" width="38" height="110" rx="11" fill="#F0EBE1" opacity="0.8" />
      <path d="M286 300 V214 H262 L305 140 L348 214 H324 V300 Z" fill="#3B4A3A" stroke="#3B4A3A" strokeWidth={26} strokeLinejoin="round" />
      <path d="M286 361 Q286 372 297 372 H313 Q324 372 324 361 V214 H344 Q350 214 347 209 L309 146 Q305 140 301 146 L263 209 Q260 214 266 214 H286 Z" fill="#B4552D" />
    </svg>
  );
}
