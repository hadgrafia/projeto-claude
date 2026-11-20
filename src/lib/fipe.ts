import { lerCache, salvarCache } from '../db';

/**
 * Tabela FIPE pela API pública gratuita (parallelum.com.br), que replica os dados da Fipe.
 * Respostas ficam guardadas no aparelho para funcionar offline depois.
 */
const BASE = 'https://parallelum.com.br/fipe/api/v1/carros';

export interface Item {
  codigo: string;
  nome: string;
}

async function obter<T>(caminho: string): Promise<T> {
  const chave = `fipe:${caminho}`;
  const guardado = await lerCache<T>(chave);
  if (!navigator.onLine && guardado) return guardado.valor;
  try {
    const r = await fetch(`${BASE}${caminho}`);
    if (!r.ok) throw new Error(String(r.status));
    const dados = (await r.json()) as T;
    await salvarCache(chave, dados);
    return dados;
  } catch (e) {
    if (guardado) return guardado.valor;
    console.warn(e);
    throw new Error('Não foi possível consultar a Tabela FIPE agora. Verifique a internet.');
  }
}

export const marcas = () => obter<Item[]>('/marcas');
export const modelos = (marca: string) => obter<{ modelos: Item[] }>(`/marcas/${marca}/modelos`).then((r) => r.modelos);
export const anos = (marca: string, modelo: string) => obter<Item[]>(`/marcas/${marca}/modelos/${modelo}/anos`);
export const preco = (marca: string, modelo: string, ano: string) =>
  obter<{ Valor: string; Marca: string; Modelo: string; AnoModelo: number; MesReferencia: string; CodigoFipe: string }>(
    `/marcas/${marca}/modelos/${modelo}/anos/${ano}`,
  );
