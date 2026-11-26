import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Icone, ICONE_PLANO } from '../components/Icone';
import { Barra, Casa, Dinheiro, Entra, Folha } from '../components/Ui';
import { EditarRenda } from '../components/EditarRenda';
import { Instalar } from '../components/Instalar';
import { PainelAgentes } from '../components/Equipe';
import { CartaoEscolherApps } from '../components/AppsPagamento';
import { CartaoAssinaturas } from '../components/Assinaturas';
import { estadoCartao } from '../lib/cartao';
import { ehPJ, situacaoDas } from '../lib/pj';
import { totalMensal } from '../lib/assinaturas';
import { AvisoNovoAcesso } from '../components/ProtecaoConta';
import { AvisoAtendimento, AvisoPedidos } from '../components/PedidosConvite';
import { useMemo, useState } from 'react';
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

  const cartaoE = useMemo(() => estadoCartao(perfil, compras, movimentos), [perfil, compras, movimentos]);
  const das = ehPJ(perfil) ? situacaoDas(perfil?.das) : undefined;
  const assinaturasMes = totalMensal(perfil?.assinaturas ?? []);

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
              <span className="suave pequeno">de {reaisCurto(totalMeta)} · {reaisCurto(livre)}/mês livres</span>
            </div>
            <span style={{ color: 'var(--sobre-verde)' }}>
              <Casa pct={totalMeta ? (totalGuardado / totalMeta) * 100 : 0} tamanho={84} />
            </span>
          </div>
        </section>
      </Entra>

      {/* Para fazer agora: tudo o que pede uma ação, num só lugar e compacto (some quando não há nada) */}
      <AvisoNovoAcesso />
      <div className="pendencias" aria-label="Para fazer agora">
        <AvisoPedidos />
        <AvisoAtendimento />
        <AvisosDoCelular />
        <CartaoCompletar />
        {das && !das.pago && (das.atrasado || das.dias <= 5) && (
          <Link to="/pj" className="cartao cartao-link" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <span className="circulo terracota"><Icone nome="documento" /></span>
            <span className="cresce coluna" style={{ gap: 2 }}>
              <strong>{das.atrasado ? 'DAS em atraso' : das.dias === 0 ? 'A DAS vence hoje' : `A DAS vence em ${das.dias} ${das.dias === 1 ? 'dia' : 'dias'}`}</strong>
              <span className="pequeno suave">Gere a guia e marque "Paguei".</span>
            </span>
            <Icone nome="direita" />
          </Link>
        )}
        {perfil && !perfil.vinculo && (
          <button type="button" className="cartao cartao-link" style={{ border: 0, textAlign: 'left', cursor: 'pointer', flexDirection: 'row', alignItems: 'center' }} onClick={() => setEditandoRenda(true)}>
            <span className="circulo terracota"><Icone nome="pessoa" /></span>
            <span className="cresce coluna" style={{ gap: 2 }}>
              <strong>Você é CLT, PJ ou autônomo?</strong>
              <span className="pequeno suave">Para calcular a renda do jeito certo.</span>
            </span>
            <Icone nome="direita" />
          </button>
        )}
        {somaPct > 100 && (
          <Link to="/planos" className="cartao cartao-link" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <span className="circulo terracota"><Icone nome="bandeira" /></span>
            <span className="cresce pequeno">Os planos somam {pct(somaPct)} do valor livre. Ajuste em Planos.</span>
          </Link>
        )}
        <CartaoEscolherApps perfil={perfil} />
        <CartaoAssinaturas perfil={perfil} soPendente />
      </div>

      <h2 className="secao">Planos</h2>
      {planos.length === 0 ? (
        <Link to="/planos/novo" className="cartao cartao-link" style={{ border: '2px dashed var(--borda)', background: 'transparent', flexDirection: 'row', alignItems: 'center' }}>
          <span className="circulo terracota"><Icone nome="mais" /></span>
          <span className="coluna" style={{ gap: 2 }}>
            <strong>Criar meu primeiro plano</strong>
            <span className="pequeno suave">Casa nova, carro, equipamentos, viagem…</span>
          </span>
        </Link>
      ) : (
        <div className="grade-2">
          {situacoes.map(({ p, s }, i) => (
            <Entra key={p.id} i={i + 1}>
              <motion.div whileTap={{ scale: 0.97 }}>
                <Link to={`/planos/${p.id}`} className="cartao cartao-link plano-mini" style={{ height: '100%' }}>
                  <span className="linha" style={{ gap: 8 }}>
                    <Icone nome={ICONE_PLANO[p.tipo]} tamanho={20} cor="var(--terracota-texto)" />
                    <span className="pequeno" style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                  </span>
                  <Dinheiro valor={s.guardado} className="num" />
                  <Barra pct={s.pct} rotulo={`Progresso de ${p.nome}`} />
                  <span className="mini suave">{pct(s.pct)} · {s.previsao ? `chega em ${mesCurto(s.previsao)}` : 'defina quanto separar'}</span>
                </Link>
              </motion.div>
            </Entra>
          ))}
        </div>
      )}

      <h2 className="secao">Seu mês</h2>
      <section className="cartao" style={{ gap: 10 }}>
        <div className="grade-3 pequeno">
          <div className="coluna" style={{ gap: 0 }}>
            <span className="mini suave">{renda.variavel ? 'Renda (segura)' : 'Renda'}</span>
            <strong className="num">{reaisCurto(renda.mensal)}</strong>
          </div>
          <div className="coluna" style={{ gap: 0 }}><span className="mini suave">Gasto típico</span><strong className="num">{reaisCurto(gasto)}</strong></div>
          <div className="coluna" style={{ gap: 0 }}><span className="mini suave">Sobra</span><strong className="num">{reaisCurto(livre)}</strong></div>
        </div>
        {renda.variavel && <span className="mini suave">Renda variável: meio-termo entre a média ({reaisCurto(renda.media ?? 0)}) e o mês fraco ({reaisCurto(renda.minimo ?? 0)}).</span>}
        {sugestoes.length > 0 && (
          <Link to="/feedback" className="pequeno" style={{ color: 'var(--terracota-texto)', fontWeight: 700 }}>
            {sugestoes.length === 1 ? '1 sugestão pode' : `${sugestoes.length} sugestões podem`} liberar {reaisCurto(ganho)}/mês para os planos →
          </Link>
        )}
        <button type="button" className="botao secundario pequeno" onClick={() => setEditandoRenda(true)}>
          <Icone nome="lapis" tamanho={18} /> Ajustar renda
        </button>
      </section>

      <h2 className="secao">Atalhos</h2>
      <div className="atalhos">
        <Atalho para="/gastos" icone="lista" titulo="Gastos" detalhe={`${movimentos.length} lançamentos`} />
        <Atalho para="/cartao" icone="cartao" titulo="Cartão" detalhe={cartaoE.limite ? `${reaisCurto(cartaoE.disponivel)} livres` : 'Informar limite'} alerta={cartaoE.limite > 0 && cartaoE.uso >= 0.8} />
        <Atalho para="/compra" icone="etiqueta" titulo="Vai comprar?" detalhe={parcelasMes > 0 ? `parcelas: ${reaisCurto(parcelasMes)}/mês` : 'Veja se cabe'} />
        <Atalho para="/assinaturas" icone="sino" titulo="Assinaturas" detalhe={assinaturasMes > 0 ? `${reaisCurto(assinaturasMes)}/mês` : 'Cadastrar'} />
        <Atalho para="/agentes" icone="conversa" titulo="Agentes" detalhe="Pergunte à equipe" />
        {ehPJ(perfil) ? <Atalho para="/pj" icone="documento" titulo="DAS e notas" detalhe={das?.pago ? 'DAS do mês paga' : perfil?.das ? `DAS vence dia ${perfil.das.dia}` : 'Ativar lembrete'} /> : <Atalho para="/feedback" icone="lampada" titulo="Conselhos" detalhe="Onde economizar" />}
      </div>

      <PainelAgentes compacto />
      <Instalar compacto />

      <Folha aberta={editandoRenda} aoFechar={() => setEditandoRenda(false)} titulo="Ajustar renda">
        {perfil && <EditarRenda perfil={perfil} aoSalvar={() => setEditandoRenda(false)} />}
      </Folha>
    </main>
  );
}

function Atalho({ para, icone, titulo, detalhe, alerta }: { para: string; icone: Parameters<typeof Icone>[0]['nome']; titulo: string; detalhe: string; alerta?: boolean }) {
  return (
    <Link to={para} className="atalho">
      <span className={`circulo ${alerta ? 'terracota' : 'manter'}`}><Icone nome={icone} tamanho={20} /></span>
      <span className="coluna" style={{ gap: 0, minWidth: 0 }}>
        <strong>{titulo}</strong>
        <span className="mini suave" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detalhe}</span>
      </span>
    </Link>
  );
}
