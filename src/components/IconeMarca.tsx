import { MARCAS } from '../lib/marcas';

/** Ícone de um serviço ou app: símbolo oficial na cor da marca, ou sigla quando não há símbolo. */
export function IconeMarca({ icone, sigla, cor, nome, tamanho = 36 }: { icone?: string; sigla?: string; cor?: string; nome: string; tamanho?: number }) {
  const m = icone ? MARCAS[icone] : undefined;
  const fundo = m?.cor ?? cor ?? '#8F4A2B';
  const claro = /^#(FF[DE]|FFE|FFF|FCF|00E6)/i.test(fundo);
  return (
    <span className="icone-marca" style={{ width: tamanho, height: tamanho, background: fundo, color: claro ? '#1C1E1A' : '#fff' }} aria-hidden="true" title={nome}>
      {m ? (
        <svg viewBox="0 0 24 24" width={tamanho * 0.58} height={tamanho * 0.58} fill="currentColor">
          <path d={m.caminho} />
        </svg>
      ) : (
        <span style={{ fontSize: Math.max(10, tamanho * (String(sigla ?? nome).length > 2 ? 0.3 : 0.4)), fontWeight: 800, letterSpacing: '-0.02em' }}>{sigla ?? nome.slice(0, 2)}</span>
      )}
    </span>
  );
}
