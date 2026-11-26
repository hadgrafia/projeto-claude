import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AjustesCartao } from '../components/AjustesExtras';
import { Avatar } from '../components/Equipe';
import { Icone } from '../components/Icone';
import { BotaoSalvar, CampoDinheiro, Segmentado } from '../components/Ui';
import { db } from '../db';
import { minhaParteMes, situacaoPlano, useDados, useSelic } from '../hooks';
import { alertasCartao, estadoCartao, numeroParcela, parcelaNaFatura, tetoCartaoPorPlanos } from '../lib/cartao';
import { dataCurta, mesLongo, reais, reaisCurto, somarMeses } from '../lib/format';

type Aba = 'resumo' | 'faturas' | 'planos' | 'ajustes';

/**
 * Cartão de crédito, em 4 abas para não amontoar:
 *  Resumo (limite, de onde vem o valor usado, avisos) · Faturas (próximos meses e parcelas)
 *  · Planos (quanto gastar por mês sem atrasar os planos) · Ajustes.
 */
export default function Cartao() {
  const navegar = useNavigate();
  const { perfil, movimentos, investimentos, renda, gasto, planos, livre } = useDados();
  const selic = useSelic();
  const compras = useLiveQuery(() => db.compras.toArray(), []) ?? [];
  const e = useMemo(() => estadoCartao(perfil, compras, movimentos), [perfil, compras, movimentos]);
  const investido = investimentos.reduce((a, i) => a + i.saldo, 0);
  const al = alertasCartao(e, renda.mensal, investido);
  const [aba, setAba] = useState<Aba>('resumo');
  const [editando, setEditando] = useState<'' | 'limite' | 'usado'>('');
  const [novoValor, setNovoValor] = useState<number>();
  const semForma = movimentos.filter((m) => m.formaPendente).length;
  const faturaAberta = e.faturas.find((f) => f.mes === e.aberta)?.valor ?? 0;
  const teto = useMemo(
    () =>
      tetoCartaoPorPlanos(
        renda.mensal,
        gasto,
        movimentos,
        planos.map((p) => ({ id: p.id!, nome: p.nome, prazo: p.prazo, precisaPorMes: minhaParteMes(situacaoPlano(p, investimentos, livre, selic?.valor)) })),
      ),
    [renda.mensal, gasto, movimentos, planos, investimentos, livre, selic?.valor],
  );
  const depois = e.itens.filter((i) => i.valor > 0);
  const somaDepois = e.usado - e.informado;

  async function salvarValor() {
    if (novoValor === undefined || novoValor < 0) return false;
    if (editando === 'limite') {
      if (!novoValor) return false;
      await db.perfil.update('eu', { limiteCartao: novoValor });
    } else await db.perfil.update('eu', { limiteUsado: novoValor, limiteUsadoEm: new Date().toISOString() });
  }

  // Sobre o fundo verde: areia até 50%, terracota até 80%, vermelho acima.
  const corUso = e.uso >= 0.8 ? '#E5484D' : e.uso >= 0.5 ? '#D9774F' : '#F0EBE1';

  if (!e.limite)
    return (
      <main className="tela sem-nav">
        <Topo voltar={() => navegar(-1)} />
        <section className="cartao" style={{ gap: 12 }}>
          <strong>Qual é o limite do seu cartão?</strong>
          <p className="pequeno suave">Com o limite, o app desconta cada compra no crédito, mostra as faturas dos próximos meses e avisa antes de estourar.</p>
          <CampoDinheiro rotulo="Limite total" valor={novoValor} aoMudar={setNovoValor} dica="Tem mais de um cartão? Some os limites." />
          <BotaoSalvar disabled={!novoValor} aoSalvar={async () => { if (!novoValor) return false; await db.perfil.update('eu', { limiteCartao: novoValor }); }}>Salvar limite</BotaoSalvar>
        </section>
      </main>
    );

  return (
    <main className="tela sem-nav">
      <Topo voltar={() => navegar(-1)} />

      {/* Resumo sempre visível: disponível, usado e fatura aberta */}
      <section className="cartao verde" style={{ gap: 10 }}>
        <span className="mini" style={{ opacity: 0.85 }}>Limite disponível</span>
        <strong className="valor-grande">{reais(e.disponivel)}</strong>
        <div className="barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(e.uso * 100)} aria-label="Limite usado">
          <div style={{ width: `${Math.min(100, e.uso * 100)}%`, background: corUso }} />
        </div>
        <div className="entre pequeno">
          <span>Usado {reaisCurto(e.usado)} de {reaisCurto(e.limite)}</span>
          <span>Fatura de {mesLongo(e.aberta)}: <strong>{reaisCurto(faturaAberta)}</strong></span>
        </div>
        <div className="grade-2">
          <button type="button" className="chip claro" onClick={() => { setNovoValor(e.usado || undefined); setEditando(editando === 'usado' ? '' : 'usado'); }}>Informar gasto atual</button>
          <button type="button" className="chip claro" onClick={() => { setNovoValor(e.limite); setEditando(editando === 'limite' ? '' : 'limite'); }}>Ajustar limite</button>
        </div>
        {editando && (
          <div className="coluna" style={{ gap: 8, background: 'var(--card)', color: 'var(--texto)', borderRadius: 16, padding: 12 }}>
            <CampoDinheiro
              rotulo={editando === 'limite' ? 'Limite total' : 'Quanto você já gastou no cartão (fatura atual)'}
              valor={novoValor}
              aoMudar={setNovoValor}
              dica={editando === 'limite' ? 'O banco aumentou ou diminuiu o limite? Ajuste aqui.' : 'Veja no app do banco. A partir de agora, só as compras no crédito feitas depois somam a este valor.'}
            />
            <BotaoSalvar className="botao pequeno" aoSalvar={salvarValor} depois={() => setEditando('')} />
          </div>
        )}
      </section>

      {al.limiteAcimaDaRenda && (
        <details className="cartao alerta-vermelho">
          <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Atenção: seu limite é maior que a sua renda</summary>
          <p className="pequeno" style={{ marginTop: 8 }}>
            {renda.mensal > 0
              ? `O banco liberou ${reaisCurto(e.limite)}, mas a sua renda é de ${reaisCurto(renda.mensal)} por mês. Usar todo o limite geraria uma fatura maior do que você ganha${al.limiteAcimaDeTudo ? `, e nem os seus investimentos (${reaisCurto(investido)}) cobririam.` : '.'}`
              : 'Informe a sua renda para o app saber quanto do limite cabe no seu bolso.'}{' '}
            Use no máximo <strong>{reaisCurto(al.usoSeguroMes)} por mês</strong> no cartão (30% da renda) e nunca pague só o mínimo.
          </p>
        </details>
      )}

      <Segmentado
        rotulo="Seções do cartão"
        valor={aba}
        aoMudar={setAba}
        opcoes={[
          { valor: 'resumo', rotulo: 'Resumo' },
          { valor: 'faturas', rotulo: 'Faturas' },
          { valor: 'planos', rotulo: 'Planos' },
          { valor: 'ajustes', rotulo: 'Ajustes' },
        ]}
      />

      {aba === 'resumo' && (
        <>
          {al.faturaAlta && (
            <section className={`cartao ${al.tirariaDosInvestimentos > 0 ? 'alerta-vermelho' : 'terracota'}`} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <Avatar id="leo" />
              <span className="pequeno">
                <strong>Fatura alta: {reais(al.fatura)}.</strong>{' '}
                {al.tirariaDosInvestimentos > 0 ? 'Passa da sua renda. Segure o cartão e nunca pague só o mínimo.' : `O recomendado é até ${reaisCurto(al.usoSeguroMes)} (30% da renda).`}
              </span>
            </section>
          )}

          <section className="cartao" style={{ gap: 10 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800 }}>De onde vem o valor usado</h2>
            <div className="entre pequeno">
              <span>Você informou{perfil?.limiteUsadoEm && e.informado ? ` em ${dataCurta(perfil.limiteUsadoEm)}` : ''}</span>
              <strong className="num">{reais(e.informado)}</strong>
            </div>
            <div className="entre pequeno">
              <span>Compras no crédito depois disso</span>
              <strong className="num">{reais(somaDepois)}</strong>
            </div>
            {depois.length > 0 && (
              <div className="lista">
                {depois.slice(0, 30).map((i) => {
                  const mov = movimentos.find((m) => m.chave === i.chave);
                  const n = numeroParcela(i, e.aberta);
                  return (
                    <div key={i.chave} className="item" style={{ cursor: 'default' }}>
                      <span className="cresce coluna" style={{ gap: 2, minWidth: 0 }}>
                        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.descricao}</strong>
                        <span className="mini suave">
                          {dataCurta(i.data)} · {i.parcelas > 1 ? `${i.parcelas}x de ${reais(i.valorParcela)}${n ? ` (${n}/${i.parcelas})` : ''}` : 'à vista'}
                          {mov?.formaAutomatica ? ' · crédito automático' : ''}
                        </span>
                      </span>
                      <strong className="num">{reaisCurto(i.parcelas > 1 ? parcelaNaFatura(i, e.aberta) || i.valorParcela : i.valor)}</strong>
                      {mov && (
                        <BotaoSalvar className="chip" style={{ width: 'auto' }} salvo="Corrigido" aoSalvar={() => db.movimentos.update(mov.id!, { forma: 'debito', formaAutomatica: false, parcelas: undefined })}>
                          Não foi crédito
                        </BotaoSalvar>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <span className="mini suave">Assinaturas e gastos no débito ou Pix não entram aqui. Quando pagar a fatura, o valor informado deixa de contar sozinho.</span>
          </section>

          {semForma > 0 && (
            <Link to="/gastos" className="cartao areia pequeno" style={{ textDecoration: 'none', color: 'inherit' }}>
              <strong>{semForma === 1 ? '1 gasto' : `${semForma} gastos`} sem dizer se foi no débito ou no crédito.</strong> Responda para a fatura ficar certa.
            </Link>
          )}

          <Link to="/compra" className="botao seta" style={{ textDecoration: 'none' }}>
            Vai fazer uma compra? Veja se cabe
            <span className="ponta"><Icone nome="seta" /></span>
          </Link>
        </>
      )}

      {aba === 'faturas' && (
        <>
          <div className="lista">
            {e.faturas.map((f, i) => (
              <div key={f.mes} className="item" style={{ cursor: 'default' }}>
                <span className="cresce coluna" style={{ gap: 2 }}>
                  <strong style={{ textTransform: 'capitalize' }}>{mesLongo(f.mes)}</strong>
                  <span className="mini suave">
                    {i === 0 && f.mes !== e.aberta ? 'Fechada' : f.mes === e.aberta ? 'Aberta' : 'Próxima'} · vence {perfil?.cartaoVencimento ? `dia ${perfil.cartaoVencimento}` : 'neste mês'}
                    {f.mes === e.mesInformado && e.informado ? ` · inclui os ${reaisCurto(e.informado)} informados` : ''}
                  </span>
                </span>
                <strong className="num" style={{ color: renda.mensal > 0 && f.valor > al.usoSeguroMes ? 'var(--terracota-texto)' : undefined }}>{reais(f.valor)}</strong>
              </div>
            ))}
          </div>
          {e.parceladas.length > 0 && (
            <>
              <h2 className="secao">Parcelas em andamento</h2>
              <div className="lista">
                {e.parceladas.map((i) => (
                  <div key={i.chave} className="item" style={{ cursor: 'default' }}>
                    <span className="cresce coluna" style={{ gap: 2 }}>
                      <strong>{i.descricao}</strong>
                      <span className="mini suave">{i.parcelas}x de {reais(i.valorParcela)} · última em {mesLongo(somarMeses(i.inicio, i.parcelas - 1))}</span>
                    </span>
                    <strong className="num">{reaisCurto(i.valorParcela)}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {aba === 'planos' && (
        <section className="cartao" style={{ gap: 12 }}>
          <p className="pequeno">Quanto dá para gastar no cartão por mês sem atrasar os seus planos.</p>
          <div className="coluna" style={{ gap: 4 }}>
            <div className="entre pequeno"><span>Renda por mês</span><strong className="num">{reais(teto.renda)}</strong></div>
            <div className="entre pequeno"><span>Gastos fora do cartão</span><strong className="num">− {reais(teto.foraDoCartao)}</strong></div>
          </div>
          {planos.length === 0 ? (
            <Link to="/planos/novo" className="pequeno" style={{ color: 'var(--terracota-texto)', fontWeight: 700 }}>Crie um plano com data desejada para ver este limite.</Link>
          ) : (
            <div className="lista">
              {teto.porPlano.map((p) => (
                <div key={p.id} className="item" style={{ cursor: 'default' }}>
                  <span className="cresce coluna" style={{ gap: 2 }}>
                    <strong>{p.nome}</strong>
                    <span className="mini suave">{p.prazo ? `até ${mesLongo(p.prazo)} de ${p.prazo.slice(0, 4)} · guardar ${reaisCurto(p.precisaPorMes)}/mês` : `guarda ${reaisCurto(p.precisaPorMes)}/mês`}</span>
                  </span>
                  <span className="coluna" style={{ alignItems: 'flex-end', gap: 0 }}>
                    <strong className="num" style={{ color: p.teto <= 0 ? 'var(--terracota-texto)' : undefined }}>{p.teto > 0 ? reaisCurto(p.teto) : 'não fecha'}</strong>
                    <span className="mini suave">no cartão/mês</span>
                  </span>
                </div>
              ))}
              {planos.length > 1 && (
                <div className="item" style={{ cursor: 'default' }}>
                  <strong className="cresce">Todos os planos juntos</strong>
                  <strong className="num" style={{ color: teto.todos.teto <= 0 ? 'var(--terracota-texto)' : undefined }}>{teto.todos.teto > 0 ? reaisCurto(teto.todos.teto) : 'não fecha'}</strong>
                </div>
              )}
            </div>
          )}
          {faturaAberta > Math.max(0, teto.todos.teto) && planos.length > 0 && (
            <span className="pequeno" style={{ color: 'var(--terracota-texto)', fontWeight: 700 }}>A fatura aberta ({reais(faturaAberta)}) já passa do valor que cabe nos planos.</span>
          )}
        </section>
      )}

      {aba === 'ajustes' && perfil && (
        <>
          <AjustesCartao perfil={perfil} titulo="Ajustes do cartão" aoSalvar={() => undefined} />
          <p className="mini suave">O app nunca acessa o seu banco nem o seu cartão: tudo aqui vem do que você informa, dos avisos que você permitiu ler e dos arquivos que você envia.</p>
        </>
      )}
    </main>
  );
}

function Topo({ voltar }: { voltar: () => void }) {
  return (
    <div className="linha">
      <button type="button" className="circulo escuro" aria-label="Voltar" onClick={voltar}><Icone nome="voltar" /></button>
      <h1 className="titulo" style={{ fontSize: 24 }}>Cartão de crédito</h1>
    </div>
  );
}
