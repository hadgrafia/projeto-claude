const CAMINHOS: Record<string, string[]> = {
  casa: ['M3 10.5 12 3l9 7.5V21H3z', 'M9 21v-6h6v6'],
  lista: ['M9 6h12M9 12h12M9 18h12', 'M4 6h.01M4 12h.01M4 18h.01'],
  bandeira: ['M5 21V4h11l-2 4 2 4H5'],
  lampada: ['M9 18h6M10 21h4', 'M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z'],
  grafico: ['M4 20V10M10 20V4M16 20v-7M22 20H2'],
  sino: ['M6 16V11a6 6 0 0 1 12 0v5l2 2H4z', 'M10 21h4'],
  microfone: ['M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z', 'M5 11a7 7 0 0 0 14 0', 'M12 18v3'],
  conversa: ['M4 5h16v11H9l-5 4z', 'M8 9h8M8 12h5'],
  engrenagem: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
  mais: ['M12 5v14M5 12h14'],
  voltar: ['M15 6l-6 6 6 6'],
  seta: ['M5 12h14M13 6l6 6-6 6'],
  direita: ['M9 6l6 6-6 6'],
  check: ['M5 12l4 4 10-10'],
  upload: ['M12 15V4M7 9l5-5 5 5', 'M5 15v5h14v-5'],
  baixar: ['M12 4v11M7 10l5 5 5-5', 'M5 20h14'],
  entrada: ['M12 19V5M6 13l6 6 6-6'],
  saida: ['M12 5v14M6 11l6-6 6 6'],
  sacola: ['M5 8h14l-1 12H6z', 'M9 8V6a3 3 0 0 1 6 0v2'],
  carro: ['M4 16v-4l2-5h12l2 5v4z', 'M4 12h16', 'M7 16.5h.01M17 16.5h.01'],
  notebook: ['M4 5h16v11H4z', 'M2 19h20'],
  aviao: ['M2 16l20-8-4 12-6-4-4 4v-6z'],
  estrela: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'],
  carrinho: ['M3 4h2l2 12h11l2-8H6', 'M9 20h.01M17 20h.01'],
  tela: ['M3 5h18v14H3z', 'M10 9l5 3-5 3z'],
  etiqueta: ['M3 12V3h9l9 9-9 9z', 'M7.5 7.5h.01'],
  raio: ['M13 3 5 14h6l-1 7 8-11h-6z'],
  cofre: ['M4 6h16v13H4z', 'M12 15a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M7 19v2M17 19v2'],
  documento: ['M7 3h7l5 5v13H7z', 'M14 3v5h5M10 13h6M10 17h6'],
  lixo: ['M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'],
  lapis: ['M4 20h4L19 9l-4-4L4 16z'],
  nuvem: ['M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z'],
  semNuvem: ['M3 3l18 18', 'M7 18h10M17.5 10a4 4 0 0 1 2.4 6.6M9.3 6.3A6 6 0 0 1 17.5 10M6 11.5A3.3 3.3 0 0 0 7 18'],
  ia: ['M12 3v3M12 18v3M3 12h3M18 12h3', 'M8 8h8v8H8z', 'M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  escudo: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
};

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({ nome, tamanho = 22, cor = 'currentColor', rotulo }: { nome: NomeIcone; tamanho?: number; cor?: string; rotulo?: string }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke={cor}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={rotulo ? undefined : true}
      role={rotulo ? 'img' : undefined}
      aria-label={rotulo}
    >
      {CAMINHOS[nome].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export const ICONE_PLANO: Record<string, NomeIcone> = {
  casa: 'casa',
  carro: 'carro',
  equipamentos: 'notebook',
  viagem: 'aviao',
  outro: 'estrela',
};

export const ICONE_CATEGORIA: Record<string, NomeIcone> = {
  Entrada: 'entrada',
  Delivery: 'sacola',
  Restaurantes: 'sacola',
  Mercado: 'carrinho',
  Assinaturas: 'tela',
  Compras: 'etiqueta',
  Contas: 'raio',
  Moradia: 'casa',
  Transporte: 'carro',
  'Apps de transporte': 'carro',
};
