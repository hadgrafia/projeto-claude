import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EscolherAssinaturas, IconeServico, salvarAssinaturas } from '../components/Assinaturas';
import { Icone } from '../components/Icone';
import { Entra } from '../components/Ui';
import { useDados } from '../hooks';
import { assinaturasDe, diasAte, proximaCobranca, totalMensal, type Assinatura } from '../lib/assinaturas';
import { pct, reais } from '../lib/format';

/** Página da Lari: assinaturas, quanto pesam no mês e as próximas cobranças. */
export default function Assinaturas() {
  const navegar = useNavigate();
  const { perfil, renda } = useDados();
  const [lista, setLista] = useState<Assinatura[]>([]);
  const [carregou, setCarregou] = useState(false);
  useEffect(() => {
    if (perfil && !carregou) {
      setLista(assinaturasDe(perfil));
      setCarregou(true);
    }
  }, [perfil, carregou]);

  const mudar = (v: Assinatura[]) => {
    setLista(v);
    salvarAssinaturas(v).catch(() => undefined);
  };
  const ordem = [...lista].sort((a, b) => proximaCobranca(a).getTime() - proximaCobranca(b).getTime());
  const mensal = totalMensal(lista);

  return (
    <main className="tela sem-nav">
      <div className="topo">
        <div className="linha">
          <button type="button" className="circulo escuro" aria-label="Voltar" onClick={() => navegar(-1)}><Icone nome="voltar" /></button>
          <h1 className="titulo" style={{ fontSize: 24 }}>Assinaturas</h1>
        </div>
      </div>

      <Entra>
        <section className="cartao verde">
          <div className="linha" style={{ alignItems: 'center' }}>
            <span className="avatar-agente" style={{ width: 44, height: 44, background: '#C08A3E', fontSize: 19 }}>L</span>
            <span className="coluna cresce" style={{ gap: 2 }}>
              <strong>Lari</strong>
              <span className="pequeno">Eu aviso antes de cada cobrança e mostro quanto as assinaturas pesam no seu mês.</span>
            </span>
          </div>
          <div className="grade-2">
            <div className="coluna" style={{ gap: 0 }}><span className="mini">Por mês</span><strong className="num" style={{ fontSize: 22 }}>{reais(mensal)}</strong></div>
            <div className="coluna" style={{ gap: 0 }}><span className="mini">Por ano</span><strong className="num" style={{ fontSize: 22 }}>{reais(mensal * 12)}</strong></div>
          </div>
          {renda.mensal > 0 && lista.length > 0 && <span className="pequeno">Isso é {pct((mensal / renda.mensal) * 100, 1)} da sua renda.</span>}
        </section>
      </Entra>

      {ordem.length > 0 && (
        <section className="cartao">
          <h2 style={{ fontSize: 15, fontWeight: 800 }}>Próximas cobranças</h2>
          {ordem.map((a) => {
            const d = proximaCobranca(a);
            const dias = diasAte(d);
            return (
              <div key={a.id} className="linha" style={{ alignItems: 'center', gap: 10 }}>
                <IconeServico a={a} tamanho={32} />
                <span className="cresce pequeno"><strong>{a.nome}</strong> · {d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
                <span className={`pilula ${dias <= 3 ? 'terracota' : 'verde'}`}>{dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `${dias} dias`}</span>
                <strong className="num pequeno">{reais(a.valor)}</strong>
              </div>
            );
          })}
        </section>
      )}

      <section className="cartao">
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>Suas assinaturas</h2>
        <EscolherAssinaturas valor={lista} aoMudar={mudar} />
      </section>

      <Link to="/agentes" className="botao secundario pequeno">Perguntar para a Lari</Link>
    </main>
  );
}
