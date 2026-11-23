import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AjustesCartao } from '../components/AjustesExtras';
import { Avatar } from '../components/Equipe';
import { Icone } from '../components/Icone';
import { BotaoSalvar, CampoDinheiro, Entra } from '../components/Ui';
import { db } from '../db';
import { minhaParteMes, situacaoPlano, useDados, useSelic } from '../hooks';
import { alertasCartao, estadoCartao, numeroParcela, parcelaNaFatura, tetoCartaoPorPlanos } from '../lib/cartao';
import { dataCurta, mesLongo, reais, reaisCurto } from '../lib/format';

/**
 * Cartão de crédito: limite (ajustável), quanto está usado, faturas que vêm por aí
 * e as compras no crédito. Alerta em vermelho quando o limite passa da renda.
 */
export default function Cartao() {
  const navegar = useNavigate();
  const { perfil, movimentos, investimentos, renda, gasto, planos, livre } = useDados();
  const selic = useSelic();
  const compras = useLiveQuery(() => db.compras.toArray(), []) ?? [];
  const e = useMemo(() => estadoCartao(perfil, compras, movimentos), [perfil, compras, movimentos]);
  const investido = investimentos.reduce((a, i) => a + i.saldo, 0);
  const al = alertasCartao(e, renda.mensal, investido);
  const [editando, setEditando] = useState(false);
  const [novoLimite, setNovoLimite] = useState<number>();
  const [msg, setMsg] = useState('');
  const semForma = movimentos.filter((m) => m.formaPendente).length;
  const faturaAberta = e.faturas.find((f) => f.mes === e.aberta);
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
  const valorFatura = faturaAberta?.valor ?? 0;

  // Mantém o formulário na tela enquanto o "✓ Salvo" aparece.
  const [primeiro, setPrimeiro] = useState(false);
  async function salvarLimite() {
    if (!novoLimite || novoLimite <= 0) return false;
    if (!e.limite) setPrimeiro(true);
    await db.perfil.update('eu', { limiteCartao: novoLimite });
  }
  function depoisDeSalvar() {
    setEditando(false);
    setPrimeiro(false);
    setMsg('Limite atualizado.');
  }

  // Sobre o fundo verde: areia até 50%, terracota até 80%, vermelho acima.
  const corUso = e.uso >= 0.8 ? '#E5484D' : e.uso >= 0.5 ? '#D9774F' : '#F0EBE1';

  return (
    <main className="tela sem-nav">
      <div className="linha">
        <button type="button" className="circulo escuro" aria-label="Voltar" onClick={() => navegar(-1)}><Icone nome="voltar" /></button>
        <div className="coluna" style={{ gap: 2 }}>
          <h1 className="titulo" style={{ fontSize: 24 }}>Cartão de crédito</h1>
          <span className="subtitulo">Limite, fatura e parcelas, para não virar dívida</span>
        </div>
      </div>

      {al.limiteAcimaDaRenda && (
        <Entra>
          <section className="cartao alerta-vermelho" role="alert">
            <strong style={{ fontSize: 17 }}>Atenção: o seu limite é maior que a sua renda</strong>
            <p className="pequeno">
              {renda.mensal > 0 ? (
                <>
                  O banco liberou {reaisCurto(e.limite)}, mas a sua renda é de {reaisCurto(renda.mensal)} por mês. Se usar todo o limite, a fatura passa do que você ganha
                  {al.limiteAcimaDeTudo
                    ? ` e nem somando os seus investimentos (${reaisCurto(investido)}) daria para pagar.`
                    : `, e só daria para pagar tirando ${reaisCurto(e.limite - renda.mensal)} dos seus investimentos (que são a sua reserva e os seus planos).`}
                </>
              ) : (
                <>Você ainda não informou a sua renda. Sem ela, não dá para saber quanto do limite cabe no seu bolso.</>
              )}
            </p>
            <p className="pequeno">
              Limite não é dinheiro seu. Para a fatura caber, use no máximo <strong>{reaisCurto(al.usoSeguroMes)} por mês</strong> no cartão (30% da renda), e nunca pague só o mínimo.
            </p>
          </section>
        </Entra>
      )}

      {(!e.limite || primeiro) && !editando ? (
        <section className="cartao" style={{ gap: 12 }}>
          <strong>Qual é o limite do seu cartão?</strong>
          <p className="pequeno suave">Com o limite, o app desconta cada compra no crédito (à vista ou parcelada), mostra a fatura dos próximos meses e avisa antes de estourar.</p>
          <CampoDinheiro rotulo="Limite total" valor={novoLimite} aoMudar={setNovoLimite} dica="Tem mais de um cartão? Some os limites." />
          <BotaoSalvar disabled={!novoLimite} aoSalvar={salvarLimite} depois={depoisDeSalvar}>Salvar limite</BotaoSalvar>
        </section>
      ) : (
        <section className="cartao verde" style={{ gap: 10 }}>
          <div className="entre">
            <span className="mini" style={{ opacity: 0.85 }}>Limite disponível</span>
            <button type="button" className="chip" style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }} onClick={() => { setNovoLimite(e.limite || undefined); setEditando(!editando); }}>
              {editando ? 'Cancelar' : 'Ajustar limite'}
            </button>
          </div>
          <strong className="valor-grande">{reais(e.disponivel)}</strong>
          <div className="barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(e.uso * 100)} aria-label="Limite usado">
            <div style={{ width: `${Math.min(100, e.uso * 100)}%`, background: corUso }} />
          </div>
          <span className="pequeno">Usado {reaisCurto(e.usado)} de {reaisCurto(e.limite)} ({Math.round(e.uso * 100)}%)</span>
          {editando && (
            <div className="coluna" style={{ gap: 8, background: 'var(--card)', color: 'var(--texto)', borderRadius: 16, padding: 12 }}>
              <CampoDinheiro rotulo="Novo limite total" valor={novoLimite} aoMudar={setNovoLimite} dica="O banco aumentou ou diminuiu o limite? Ajuste aqui." />
              <BotaoSalvar className="botao pequeno" disabled={!novoLimite} aoSalvar={salvarLimite} depois={depoisDeSalvar} />
            </div>
          )}
        </section>
      )}
      {msg && <p className="cartao manter pequeno" role="status">{msg}</p>}

      {semForma > 0 && (
        <Link to="/gastos" className="cartao areia pequeno" style={{ textDecoration: 'none', color: 'inherit' }}>
          <strong>{semForma === 1 ? '1 gasto' : `${semForma} gastos`} sem dizer se foi no débito ou no crédito.</strong> Responda para a fatura e o limite ficarem certos.
        </Link>
      )}

      {al.faturaAlta && (
        <section className={`cartao ${al.tirariaDosInvestimentos > 0 ? 'alerta-vermelho' : 'terracota'}`} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <Avatar id="leo" />
          <span className="pequeno">
            <strong>Leo: fatura alta.</strong>{' '}
            {al.tirariaDosInvestimentos > 0
              ? `${reais(al.fatura)} passa da sua renda. ${al.semCobertura ? 'Nem os investimentos cobrem: pare de usar o cartão e fale com o banco antes do vencimento para negociar.' : `Para pagar inteira, sairiam ${reais(al.tirariaDosInvestimentos)} dos investimentos.`} Não pague só o mínimo: o rotativo tem os juros mais altos do país.`
              : `${reais(al.fatura)} é ${renda.mensal > 0 ? Math.round((al.fatura / renda.mensal) * 100) : 100}% da sua renda (o recomendado é até 30%, ${reaisCurto(al.usoSeguroMes)}). Segure as compras no crédito até ela baixar.`}
          </span>
        </section>
      )}

      <h2 className="secao">Quanto gastar no cartão por mês</h2>
      <section className="cartao" style={{ gap: 12 }}>
        <p className="pequeno">
          Para não atrasar os seus planos, o cartão precisa caber no que sobra da renda depois dos gastos fora do cartão e do que cada plano precisa guardar por mês.
        </p>
        <div className="coluna" style={{ gap: 4 }}>
          <div className="entre pequeno"><span>Renda por mês</span><strong className="num" style={{ whiteSpace: 'nowrap' }}>{reais(teto.renda)}</strong></div>
          <div className="entre pequeno"><span>Gastos fora do cartão (débito, Pix, dinheiro)</span><strong className="num" style={{ whiteSpace: 'nowrap' }}>− {reais(teto.foraDoCartao)}</strong></div>
          {teto.cartaoTipico > 0 && <span className="mini suave">Nos últimos meses, você gastou em média {reais(teto.cartaoTipico)} por mês no cartão.</span>}
        </div>
        {planos.length === 0 ? (
          <Link to="/planos/novo" className="pequeno" style={{ color: 'var(--terracota-texto)', fontWeight: 700 }}>Crie um plano com data desejada para ver o limite de gastos no cartão para chegar lá.</Link>
        ) : (
          <div className="lista">
            {teto.porPlano.map((p) => (
              <div key={p.id} className="item" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                <span className={`circulo ${p.teto <= 0 ? 'terracota' : 'manter'}`}><Icone nome="bandeira" /></span>
                <span className="cresce coluna" style={{ gap: 3 }}>
                  <strong>{p.nome}{p.prazo ? ` até ${mesLongo(p.prazo)} de ${p.prazo.slice(0, 4)}` : ''}</strong>
                  <span className="pequeno suave">
                    {p.prazo ? `Precisa guardar ${reais(p.precisaPorMes)} por mês para chegar no prazo.` : `Sem data desejada: conta o que você já separa (${reais(p.precisaPorMes)} por mês).`}
                  </span>
                  {p.teto > 0 ? (
                    <span className="pequeno">
                      Para chegar lá, gaste no máximo <strong>{reais(p.teto)} por mês</strong> no cartão.
                      {valorFatura > p.teto ? <span style={{ color: 'var(--terracota-texto)', fontWeight: 700 }}> A fatura aberta ({reais(valorFatura)}) já passa disso.</span> : null}
                    </span>
                  ) : (
                    <span className="pequeno" style={{ color: 'var(--terracota-texto)', fontWeight: 700 }}>
                      Com os gastos de hoje, esse prazo não fecha nem sem usar o cartão: faltam {reais(-p.teto)} por mês. Corte gastos, aumente a renda ou ajuste a data no plano.
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
        {planos.length > 1 && (
          <div className={`cartao ${teto.todos.teto > 0 ? 'verde' : 'alerta-vermelho'}`} style={{ padding: 14, gap: 4 }}>
            <span className="mini" style={{ opacity: 0.85 }}>Todos os planos juntos ({reais(teto.todos.precisa)} por mês)</span>
            {teto.todos.teto > 0 ? (
              <>
                <strong>No cartão, até {reais(teto.todos.teto)} por mês</strong>
                {(teto.cartaoTipico > teto.todos.teto || valorFatura > teto.todos.teto) && (
                  <span className="mini">
                    {valorFatura > teto.todos.teto ? `A fatura aberta (${reais(valorFatura)}) já passa disso. ` : ''}
                    {teto.cartaoTipico > teto.todos.teto ? `Você tem gastado ${reais(teto.cartaoTipico)} por mês no cartão: para manter todos os planos no prazo, reduza ou ajuste as datas.` : ''}
                  </span>
                )}
              </>
            ) : (
              <strong>Não fecha: faltam {reais(-teto.todos.teto)} por mês, mesmo sem cartão</strong>
            )}
          </div>
        )}
        <span className="mini suave">Os gastos fora do cartão são a média dos últimos 3 meses com registros (ou a estimativa que você deu no início). Marque "Crédito" nos gastos para a conta ficar certa.</span>
      </section>

      <h2 className="secao">Faturas</h2>
      <div className="lista">
        {e.faturas.map((f, i) => (
          <div key={f.mes} className="item" style={{ cursor: 'default' }}>
            <span className={`circulo ${f.mes === e.aberta ? 'terracota' : 'manter'}`}><Icone nome="calendario" /></span>
            <span className="cresce coluna" style={{ gap: 2 }}>
              <strong style={{ textTransform: 'capitalize' }}>{mesLongo(f.mes)}</strong>
              <span className="pequeno suave">
                {i === 0 && f.mes !== e.aberta ? 'Fechada, vence' : f.mes === e.aberta ? 'Aberta, vence' : 'Vence'}
                {perfil?.cartaoVencimento ? ` dia ${perfil.cartaoVencimento}` : ' neste mês'}
              </span>
            </span>
            <strong className="num" style={{ color: renda.mensal > 0 && f.valor > al.usoSeguroMes ? 'var(--terracota-texto)' : undefined }}>{reais(f.valor)}</strong>
          </div>
        ))}
      </div>
      <p className="mini suave">
        Somam as compras no crédito registradas no app (avisos do banco, extratos, faturas e à mão).
        {perfil?.limiteUsado ? ` O valor já usado que você informou (${reaisCurto(perfil.limiteUsado)}${perfil.limiteUsadoEm ? ` em ${dataCurta(perfil.limiteUsadoEm)}` : ''}) entra no limite, mas não nas faturas; quando pagar a fatura, atualize-o abaixo.` : ''}
      </p>

      <h2 className="secao">Compras no crédito</h2>
      {e.itens.length === 0 && <p className="vazio">Nenhuma compra no crédito registrada ainda. Ao anotar um gasto, escolha "Crédito" e em quantas vezes.</p>}
      <div className="lista">
        {e.itens.slice(0, 40).map((i, k) => {
          const n = faturaAberta ? numeroParcela(i, e.aberta) : 0;
          const naAberta = parcelaNaFatura(i, e.aberta);
          return (
            <Entra key={i.chave} i={k}>
              <div className="item" style={{ cursor: 'default' }}>
                <span className="circulo rever"><Icone nome="etiqueta" /></span>
                <span className="cresce coluna" style={{ gap: 2 }}>
                  <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.descricao}</strong>
                  <span className="pequeno suave">
                    {dataCurta(i.data)} · {i.parcelas > 1 ? `${i.parcelas}x de ${reais(i.valorParcela)}` : 'à vista'}
                    {i.parcelas > 1 && n > 0 ? ` · parcela ${n}/${i.parcelas} na fatura aberta` : ''}
                  </span>
                </span>
                <span className="coluna" style={{ alignItems: 'flex-end', gap: 2 }}>
                  <strong className="num">{reaisCurto(i.valor)}</strong>
                  {naAberta > 0 && i.parcelas > 1 && <span className="mini suave">{reaisCurto(naAberta)} nesta</span>}
                </span>
              </div>
            </Entra>
          );
        })}
      </div>

      <Link to="/compra" className="botao seta" style={{ textDecoration: 'none' }}>
        Vai fazer uma compra? Veja se cabe na fatura
        <span className="ponta"><Icone nome="seta" /></span>
      </Link>

      {perfil && <AjustesCartao perfil={perfil} titulo="Ajustes do cartão" aoSalvar={setMsg} />}
      <p className="mini suave">O app nunca acessa o seu banco nem o seu cartão: tudo aqui vem do que você informa, dos avisos que você permitiu ler e dos arquivos que você envia.</p>
    </main>
  );
}
