import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icone } from '../components/Icone';
import { db } from '../db';
import { useDados, useOnline } from '../hooks';
import { entrarDeNovo, entrarNoConjunto, SessaoExpirada } from '../lib/conjunto';

const PENDENTE = 'convite-pendente';

/** Guarda o convite enquanto a pessoa faz o primeiro acesso. */
export const convitePendente = () => {
  try {
    return localStorage.getItem(PENDENTE) ?? undefined;
  } catch {
    return undefined;
  }
};

export default function Convite() {
  const [busca] = useSearchParams();
  const navegar = useNavigate();
  const online = useOnline();
  const { perfil, movimentos, investimentos } = useDados();
  const [erro, setErro] = useState<{ msg: string; sessao?: boolean }>();
  const [entrando, setEntrando] = useState(false);
  const p = busca.get('p') ?? '';
  const c = busca.get('c') ?? '';
  const k = busca.get('k') ?? '';
  const valido = /^[\w-]{16,64}$/.test(p) && /^[\w-]{16,64}$/.test(c) && /^[\w-]{40,48}$/.test(k);

  useEffect(() => {
    if (!valido) return;
    // Lê direto do banco: logo depois do primeiro acesso, os dados ao vivo ainda podem estar atrasados.
    db.perfil.get('eu').then((eu) => {
      if (eu?.concluiuInicio) return;
      try {
        localStorage.setItem(PENDENTE, `/convite?${busca.toString()}`);
      } catch {
        /* sem armazenamento: o convite precisa ser aberto de novo depois */
      }
      navegar('/boas-vindas', { replace: true });
    });
  }, [valido, busca, navegar]);

  async function entrar() {
    setEntrando(true);
    setErro(undefined);
    try {
      const ja = (await db.planos.toArray()).find((x) => x.conjunto?.id === p);
      // Lê o perfil direto do banco para o resumo já sair com o nome certo.
      const eu = perfil ?? (await db.perfil.get('eu'));
      const id = ja?.id ?? (await entrarNoConjunto(p, c, k, { perfil: eu, movimentos, investimentos }));
      try {
        localStorage.removeItem(PENDENTE);
      } catch {
        /* ignora */
      }
      navegar(`/planos/${id}`, { replace: true });
    } catch (e) {
      setErro({ msg: (e as Error).message, sessao: e instanceof SessaoExpirada });
    } finally {
      setEntrando(false);
    }
  }

  return (
    <main className="tela sem-nav" style={{ minHeight: '100dvh', justifyContent: 'center' }}>
      <div className="cartao verde" style={{ alignItems: 'center', textAlign: 'center', padding: 28 }}>
        <span className="circulo terracota" style={{ width: 64, height: 64 }}><Icone nome="casa" tamanho={30} /></span>
        <h1 className="titulo" style={{ fontSize: 24 }}>Você foi convidada para um plano em conjunto</h1>
        <p className="pequeno suave">
          Vocês vão juntar dinheiro para o mesmo objetivo. Seus gastos continuam só com você: o grupo vê apenas um resumo (quanto guardou, quanto separa por mês e onde pode economizar).
        </p>
      </div>
      {!valido ? (
        <p className="cartao areia">Este link de convite está incompleto. Peça um novo.</p>
      ) : (
        <button type="button" className="botao seta" disabled={!online || entrando} onClick={entrar}>
          {entrando ? 'Entrando…' : online ? 'Entrar no plano' : 'Precisa de internet'}
          <span className="ponta"><Icone nome="seta" /></span>
        </button>
      )}
      {erro && (
        <div className="cartao areia pequeno">
          {erro.msg}
          {erro.sessao && <button type="button" className="botao pequeno" onClick={entrarDeNovo}>Entrar de novo</button>}
        </div>
      )}
    </main>
  );
}
