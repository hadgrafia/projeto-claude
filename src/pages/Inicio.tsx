import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Icone, ICONE_PLANO } from '../components/Icone';
import { Barra, Casa, Dinheiro, Entra, Folha } from '../components/Ui';
import { EditarRenda } from '../components/EditarRenda';
import { Instalar } from '../components/Instalar';
import { PainelAgentes } from '../components/Equipe';
import { CartaoEscolherApps } from '../components/AppsPagamento';
import { CartaoAssinaturas } from '../components/Assinaturas';
import { ResumoCartao } from '../components/CartaoCredito';
import { AvisoNovoAcesso } from '../components/ProtecaoConta';
import { AvisoAtendimento, AvisoPedidos } from '../components/PedidosConvite';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { compromissoDoMes } from '../lib/compras';
import { situacaoPlano, useDados, useSelic } from '../hooks';
import { analisarMes } from '../lib/feedback';
import { mesCurto, pct, reaisCurto } from '../lib/format';
import { BotaoOlho } from '../components/OlhoValores';
import { CartaoCompletar } from '../components/Lugar';
import { AvisosDoCelular } from '../components/FormaPagamento';

const saudacao = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};

export default function Inicio() {
  const { perfil, planos, investimentos, movimentos, renda, gasto, livre, somaPct } = useDados();
  const selic = useSelic();
  const situacoes = planos.map((p) => ({ p, s: situacaoPlano(p, investimentos, livre, selic?.valor) }));
  const totalGuardado = situacoes.reduce((a, x) => a + x.s.guardado, 0);
  const totalMeta = planos.reduce((a, p) => a + p.meta, 0);
  const sugestoes = analisarMes(movimentos, renda.mensal).filter((s) => s.status !== 'manter');
  const ganho = sugestoes.reduce((a, s) => a + s.ganhoMensal, 0);
  const [editandoRenda, setEditandoRenda] = useState(false);
  const compras = useLiveQuery(() => db.compras.toArray(), []) ?? [];
  const parcelasMes = compromissoDoMes(compras);

  return (
    <main className="tela">
      <div className="topo">
        <div className="coluna" style={{ gap: 2 }}>
          <span className="subtitulo">{saudacao()}{perfil?.nome ? `, ${perfil.nome}` : ''}</span>
          <strong style={{ fontSize: 20, fontWeight: 800 }}>Seus planos</strong>
        </div>
        <div className="linha" style={{ gap: 8 }}>
          <BotaoOlho />
          <Link to="/ajustes" className="circulo card" aria-label="Ajustes">
            <Icone nome="engrenagem" tamanho={20} />
          </Link>
        </div>
      </div>

      <Entra largo>
        <section className="cartao verde">
          <div className="linha" style={{ alignItems: 'center' }}>
            <div className="coluna cresce" style={{ gap: 6 }}>
              <span className="suave pequeno">Guardado em todos os planos</span>
              <Dinheiro valor={totalGuardado} className="valor-grande" />
              <span className="suave pequeno">de {reaisCurto(totalMeta)}</span>
            </div>
            <span style={{ color: 'var(--sobre-verde)' }}>
              <Casa pct={totalMeta ? (totalGuardado / totalMeta) * 100 : 0} tamanho={96} />
            </span>
          </div>
          <div className="chips">
            <span className="pilula verde">{planos.length} {planos.length === 1 ? 'plano' : 'planos'}</span>
            <span className="pilula terracota">{reaisCurto(livre)}/mês livres</span>
          </div>
        </section>
      </Entra>

      <AvisoNovoAcesso />
      <AvisoPedidos />
      <AvisoAtendimento />
      <CartaoCompletar />
      <AvisosDoCelular />
      <CartaoEscolherApps perfil={perfil} />
      <CartaoAssinaturas perfil={perfil} />
      <ResumoCartao perfil={perfil} movimentos={movimentos} investimentos={investimentos} renda={renda.mensal} />
      <Instalar compacto />
      <PainelAgentes compacto />

      {planos.length === 0 ? (
        <Entra i={1}>
          <Link to="/planos/novo" className="cartao cartao-link" style={{ border: '2px dashed var(--borda)', background: 'transparent', flexDirection: 'row', alignItems: 'center' }}>
            <span className="circulo terracota"><Icone nome="mais" /></span>
            <span className="coluna" style={{ gap: 2 }}>
              <strong>Criar meu primeiro plano</strong>
              <span className="pequeno suave">Casa nova, carro, equipamentos, viagem…</span>
            </span>
          </Link>
        </Entra>
      ) : (
        <div className="grade-2">
          {situacoes.map(({ p, s }, i) => (
            <Entra key={p.id} i={i + 1}>
              <motion.div whileTap={{ scale: 0.97 }}>
                <Link to={`/planos/${p.id}`} className={`cartao cartao-link ${i === 0 ? 'terracota' : ''}`} style={{ height: '100%' }}>
                  <Icone nome={ICONE_PLANO[p.tipo]} tamanho={26} cor={i === 0 ? '#fff' : 'var(--terracota-texto)'} />
                  <span className="pequeno" style={{ fontWeight: 600 }}>{p.nome}</span>
                  <Dinheiro valor={s.guardado} className="num" />
                  <span className="mini suave">de {reaisCurto(p.meta)} · {pct(s.pct)}</span>
                  <Barra pct={s.pct} rotulo={`Progresso de ${p.nome}`} />
                  <span className="mini suave">{s.previsao ? `Previsão ${mesCurto(s.previsao)}` : 'Defina quanto separar'}</span>
                </Link>
              </motion.div>
            </Entra>
          ))}
        </div>
      )}

      {somaPct > 100 && (
        <Link to="/planos" className="cartao areia cartao-link pequeno">
          A soma das porcentagens dos planos passou de 100% ({pct(somaPct)}). Ajuste em Planos.
        </Link>
      )}

      <Entra i={4}>
        <section className="cartao">
          <div className="entre">
            <span className="pequeno suave" style={{ fontWeight: 600 }}>{renda.variavel ? 'Renda usada nos planos' : 'Renda mensal'}{perfil?.vinculo ? ` · ${perfil.vinculo === 'clt' ? 'CLT' : perfil.vinculo === 'pj' ? 'PJ' : perfil.vinculo === 'autonomo' ? 'Autônomo' : perfil.vinculo === 'servidor' ? 'Servidor' : 'Outro'}` : ''}</span>
            <Dinheiro valor={renda.mensal} className="num" />
          </div>
          {renda.variavel && (
            <span className="mini suave">
              Renda variável: meio-termo entre a média ({reaisCurto(renda.media ?? 0)}) e o mês fraco ({reaisCurto(renda.minimo ?? 0)}){renda.fonte === 'registrada' ? ', pelas entradas registradas dos últimos meses' : ''}. Assim os planos não dependem dos meses bons.
            </span>
          )}
          {perfil && !perfil.vinculo && (
            <button type="button" className="cartao areia pequeno" style={{ border: 0, textAlign: 'left', cursor: 'pointer', padding: 12 }} onClick={() => setEditandoRenda(true)}>
              <strong>Você é CLT, PJ ou autônomo?</strong> Responda para o app calcular a renda do jeito certo (PJ e autônomo variam mês a mês).
            </button>
          )}
          <div className="grade-2 pequeno">
            <div className="coluna" style={{ gap: 0 }}><span className="mini suave">Gasto típico</span><strong className="num">{reaisCurto(gasto)}</strong></div>
            <div className="coluna" style={{ gap: 0 }}><span className="mini suave">Sobra para os planos</span><strong className="num">{reaisCurto(livre)}</strong></div>
          </div>
          {renda.entradasDoMes > 0 && <span className="mini suave">Entradas registradas este mês: {reaisCurto(renda.entradasDoMes)}.</span>}
          <button type="button" className="botao secundario pequeno" onClick={() => setEditandoRenda(true)}>
            <Icone nome="lapis" tamanho={18} /> Ajustar renda
          </button>
        </section>
      </Entra>

      <Entra i={5}>
        <Link to="/compra" className="cartao terracota cartao-link" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <span className="circulo" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}><Icone nome="etiqueta" /></span>
          <span className="cresce coluna" style={{ gap: 2 }}>
            <strong>Vai fazer uma compra?</strong>
            <span className="pequeno">Veja se vale agora e em quantas vezes parcelar{parcelasMes > 0 ? ` · parcelas este mês: ${reaisCurto(parcelasMes)}` : ''}</span>
          </span>
          <Icone nome="direita" />
        </Link>
      </Entra>

      {sugestoes.length > 0 && (
        <Entra i={5}>
          <Link to="/feedback" className="cartao grafite cartao-link" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <span className="circulo terracota"><Icone nome="lampada" /></span>
            <span className="cresce pequeno" style={{ fontSize: 14 }}>
              <strong>{sugestoes.length} {sugestoes.length === 1 ? 'sugestão' : 'sugestões'}</strong> podem liberar {reaisCurto(ganho)}/mês para seus planos
            </span>
          </Link>
        </Entra>
      )}

      <Entra i={6}>
        <Link to="/gastos" className="cartao cartao-link" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <span className="circulo manter"><Icone nome="lista" /></span>
          <span className="cresce coluna" style={{ gap: 2 }}>
            <strong>{movimentos.length} lançamentos registrados</strong>
            <span className="pequeno suave">Envie o extrato ou anote um gasto</span>
          </span>
          <Icone nome="direita" />
        </Link>
      </Entra>
      <Folha aberta={editandoRenda} aoFechar={() => setEditandoRenda(false)} titulo="Ajustar renda">
        {perfil && <EditarRenda perfil={perfil} aoSalvar={() => setEditandoRenda(false)} />}
      </Folha>
    </main>
  );
}
