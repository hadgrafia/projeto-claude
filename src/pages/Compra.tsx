import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import { CampoDinheiro, Entra } from '../components/Ui';
import { db, type Importancia } from '../db';
import { situacaoPlano, useDados, useSelic } from '../hooks';
import { compromissoDoMes, contextoDeCompra, inicioParcelas, parcelasNoMes, recomendar, saldoDevedor } from '../lib/compras';
import { estadoCartao } from '../lib/cartao';
import { mesCurto, reais, reaisCurto, somarMeses } from '../lib/format';
import { conferirLimiteCartao } from '../lib/avisos';
import { CampoParcelamento, type Parcelamento } from '../components/Parcelamento';

const IMPORTANCIAS: { valor: Importancia; rotulo: string; dica: string }[] = [
  { valor: 'necessidade', rotulo: 'Necessidade', dica: 'Saúde, trabalho, casa, algo que quebrou' },
  { valor: 'util', rotulo: 'Útil', dica: 'Melhora o dia a dia, mas pode esperar um pouco' },
  { valor: 'desejo', rotulo: 'Desejo', dica: 'Vontade, presente para mim, novidade' },
];

/** Conselheiro de compras: antes de comprar, mostra se vale e como pagar. */
export default function Compra() {
  const navegar = useNavigate();
  const { perfil, planos, investimentos, livre, renda, movimentos } = useDados();
  const selic = useSelic();
  const compras = useLiveQuery(() => db.compras.toArray(), []) ?? [];
  const [descricao, setDescricao] = useState('');
  const [importancia, setImportancia] = useState<Importancia>();
  const [valor, setValor] = useState<number>();
  const [maxSemJuros, setMaxSemJuros] = useState(1);
  const [temJuros, setTemJuros] = useState(false);
  const [opcaoJuros, setOpcaoJuros] = useState<Parcelamento>({ parcelas: 12, comJuros: true });
  const [desconto, setDesconto] = useState<number>();
  const [noCartao, setNoCartao] = useState(true);
  const [salvo, setSalvo] = useState('');

  const aportePlanos = planos.reduce((a, p) => a + situacaoPlano(p, investimentos, livre, selic?.valor).meuAporte, 0);
  const cartao = useMemo(() => estadoCartao(perfil, compras, movimentos), [perfil, compras, movimentos]);
  const ctx = useMemo(() => contextoDeCompra({ perfil, compras, movimentos, renda: renda.mensal, livre, aportePlanos }), [perfil, compras, movimentos, renda.mensal, livre, aportePlanos]);
  const pronto = Boolean(descricao.trim() && importancia && valor && valor > 0);
  const rec = useMemo(
    () =>
      pronto
        ? recomendar(
            { valor: valor!, importancia: importancia!, maxSemJuros, comJuros: temJuros && opcaoJuros.total && opcaoJuros.parcelas > 1 ? { parcelas: opcaoJuros.parcelas, total: opcaoJuros.total } : undefined, descontoAVista: desconto, noCartao },
            ctx,
          )
        : undefined,
    [pronto, valor, importancia, maxSemJuros, temJuros, opcaoJuros, desconto, noCartao, ctx],
  );

  async function registrar() {
    if (!rec) return;
    await db.compras.add({
      descricao: descricao.trim(),
      importancia: importancia!,
      valor: valor!,
      parcelas: rec.parcelas,
      juros: rec.juros,
      ...(rec.decisao === 'com-juros' ? { totalComJuros: rec.totalPago } : {}),
      valorParcela: rec.valorParcela,
      noCartao,
      inicio: inicioParcelas(noCartao, new Date(), perfil),
      criadaEm: new Date().toISOString(),
    });
    setSalvo(`Compra registrada: ${rec.parcelas}x de ${reais(rec.valorParcela)}.`);
    if (noCartao) conferirLimiteCartao().catch(() => undefined);
    setDescricao('');
    setValor(undefined);
    setImportancia(undefined);
  }

  async function adiarComoPlano() {
    if (!rec) return;
    const id = await db.planos.add({
      nome: descricao.trim(),
      tipo: 'outro',
      meta: valor! * (1 - (desconto ?? 0) / 100),
      guardado: 0,
      percentual: 0,
      prazo: rec.mesesParaJuntar ? somarMeses(new Date().toISOString().slice(0, 7), rec.mesesParaJuntar) : undefined,
      respostas: { descricao: descricao.trim(), valor },
      criadoEm: new Date().toISOString(),
    });
    navegar(`/planos/${id}`);
  }

  const avulsas = cartao.parceladas.filter((i) => !i.chave.startsWith('c'));
  const ativas = compras.filter((c) => saldoDevedor(c) > 0).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const proximoMes = somarMeses(new Date().toISOString().slice(0, 7), 1);
  const cor = rec?.decisao === 'adiar' || rec?.decisao === 'nao-cabe' ? 'terracota' : rec?.decisao === 'com-juros' ? 'areia' : 'verde';

  return (
    <main className="tela sem-nav">
      <div className="linha">
        <button type="button" className="circulo escuro" aria-label="Voltar" onClick={() => navegar(-1)}><Icone nome="voltar" /></button>
        <div className="coluna" style={{ gap: 2 }}>
          <h1 className="titulo" style={{ fontSize: 24 }}>Antes de comprar</h1>
          <span className="subtitulo">Veja se vale agora e a melhor forma de pagar</span>
        </div>
      </div>

      <section className="cartao" style={{ gap: 14 }}>
        <label className="campo">
          O que vai comprar ou para quê?
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: geladeira nova, curso, tênis" />
        </label>
        <div className="campo">
          Quanto isso é importante agora?
          <div className="coluna" role="radiogroup" aria-label="Importância">
            {IMPORTANCIAS.map((i) => (
              <button
                key={i.valor}
                type="button"
                role="radio"
                aria-checked={importancia === i.valor}
                className="chip"
                onClick={() => setImportancia(i.valor)}
                style={{ textAlign: 'left', minHeight: 52, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', background: importancia === i.valor ? 'var(--verde)' : 'var(--bg)', color: importancia === i.valor ? 'var(--sobre-verde)' : 'var(--texto)' }}
              >
                <strong>{i.rotulo}</strong>
                <span style={{ fontWeight: 500, fontSize: 12, opacity: 0.85 }}>{i.dica}</span>
              </button>
            ))}
          </div>
        </div>
        <CampoDinheiro rotulo="Preço da compra (sem juros)" valor={valor} aoMudar={setValor} dica="O preço à vista ou sem juros. Se a loja cobrar juros no parcelamento, marque a opção abaixo." />
        <label className="campo">
          Até quantas vezes SEM juros a loja parcela?
          <select value={maxSemJuros} onChange={(e) => setMaxSemJuros(Number(e.target.value))}>
            <option value={1}>Só à vista</option>
            {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}x sem juros</option>)}
          </select>
        </label>
        <div className="grade-2">
          <label className="campo">
            Desconto à vista
            <div className="com-sufixo">
              <input inputMode="decimal" value={desconto ?? ''} onChange={(e) => setDesconto(e.target.value ? Number(e.target.value.replace(',', '.')) : undefined)} placeholder="0" />
              <span>%</span>
            </div>
          </label>
          <div className="campo">
            No cartão de crédito?
            <div className="chips">
              <button type="button" className="chip" aria-pressed={noCartao} onClick={() => setNoCartao(true)}>Sim</button>
              <button type="button" className="chip" aria-pressed={!noCartao} onClick={() => setNoCartao(false)}>Não</button>
            </div>
          </div>
        </div>
        <label className="linha pequeno" style={{ gap: 10 }}>
          <input type="checkbox" checked={temJuros} onChange={(e) => setTemJuros(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--terracota)' }} />
          A loja também oferece parcelamento COM juros
        </label>
        {temJuros && <CampoParcelamento preco={valor} valor={opcaoJuros} aoMudar={setOpcaoJuros} somenteComJuros maxParcelas={48} rotuloParcelas="Com juros, em quantas vezes?" />}
        {noCartao && (cartao.limite ? (
          <Link to="/cartao" className="cartao areia" style={{ gap: 4, textDecoration: 'none', color: 'inherit', padding: 12 }}>
            <span className="mini suave">Seu cartão agora</span>
            <span className="pequeno">
              Fatura aberta: <strong>{reaisCurto(ctx.faturaAtual ?? 0)}</strong> · Limite livre: <strong>{reaisCurto(cartao.disponivel)}</strong> de {reaisCurto(cartao.limite)}
            </span>
            <span className="mini suave">A recomendação já considera a fatura e o limite. Toque para ver o cartão.</span>
          </Link>
        ) : (
          <Link to="/cartao" className="mini suave">Informe o limite do seu cartão para o app olhar a fatura antes de dizer se dá para comprar.</Link>
        ))}
      </section>

      <AnimatePresence mode="wait">
        {rec ? (
          <motion.section key={rec.titulo} className={`cartao ${cor}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} aria-live="polite">
            <span className="mini" style={{ opacity: 0.85 }}>Recomendação</span>
            <strong style={{ fontSize: 20 }}>{rec.titulo}</strong>
            {rec.explicacao.map((t) => <p key={t} className="pequeno">{t}</p>)}
            {rec.atrasoPlanos > 0 && <p className="pequeno">Impacto: seus planos podem atrasar cerca de {rec.atrasoPlanos} {rec.atrasoPlanos === 1 ? 'mês' : 'meses'}.</p>}
            {rec.alertas.map((t) => (
              <p key={t} className="pequeno" style={{ display: 'flex', gap: 8 }}><Icone nome="sino" tamanho={18} /> {t}</p>
            ))}
            <span className="mini" style={{ opacity: 0.8 }}>Base: renda {reaisCurto(renda.mensal)}, sobra {reaisCurto(livre)}/mês, espaço seguro para parcelas {reaisCurto(rec.espacoMensal)}/mês.</span>
            <div className="grade-2">
              {rec.decisao === 'adiar' || rec.decisao === 'nao-cabe' ? (
                <>
                  <button type="button" className="botao pequeno secundario" onClick={adiarComoPlano}>Juntar antes (criar plano)</button>
                  <button type="button" className="botao pequeno secundario" onClick={registrar}>Comprar mesmo assim</button>
                </>
              ) : (
                <button type="button" className="botao pequeno secundario" style={{ gridColumn: 'span 2' }} onClick={registrar}>Vou seguir: registrar compra</button>
              )}
            </div>
          </motion.section>
        ) : (
          <p className="cartao areia pequeno">Preencha o que vai comprar, a importância e o valor para ver a recomendação.</p>
        )}
      </AnimatePresence>
      {salvo && <p className="cartao manter pequeno" role="status">{salvo}</p>}

      <h2 className="secao">Compras parceladas</h2>
      {ativas.length === 0 && avulsas.length === 0 && <p className="vazio">Nenhuma parcela em aberto.</p>}
      {avulsas.length > 0 && (
        <div className="lista">
          {avulsas.map((i) => (
            <Link key={i.chave} to="/cartao" className="item" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="circulo rever"><Icone nome="cartao" /></span>
              <span className="cresce coluna" style={{ gap: 2 }}>
                <strong>{i.descricao}</strong>
                <span className="pequeno suave">{i.parcelas}x de {reais(i.valorParcela)} no cartão · até {mesCurto(somarMeses(i.inicio, i.parcelas - 1))}</span>
              </span>
              <strong className="num">{reaisCurto(i.valorParcela)}</strong>
            </Link>
          ))}
        </div>
      )}
      {ativas.length > 0 && (
        <div className="lista">
          {ativas.map((c, i) => (
            <Entra key={c.id} i={i}>
              <div className="item" style={{ cursor: 'default' }}>
                <span className="circulo rever"><Icone nome="etiqueta" /></span>
                <span className="cresce coluna" style={{ gap: 2 }}>
                  <strong>{c.descricao}</strong>
                  <span className="pequeno suave">
                    {c.parcelas}x de {reais(c.valorParcela)}{c.juros ? ` · com juros: ${reais(c.totalComJuros ?? c.valorParcela * c.parcelas)} no total (${reais((c.totalComJuros ?? c.valorParcela * c.parcelas) - c.valor)} a mais)` : ' sem juros'} · até {mesCurto(somarMeses(c.inicio, c.parcelas - 1))}
                  </span>
                </span>
                <span className="coluna" style={{ alignItems: 'flex-end', gap: 2 }}>
                  <strong className="num">{reaisCurto(c.valorParcela)}</strong>
                  <span className="mini suave">falta {reaisCurto(saldoDevedor(c))}</span>
                </span>
                <button type="button" className="circulo card" aria-label={`Apagar ${c.descricao}`} onClick={() => confirm(`Apagar "${c.descricao}"?`) && db.compras.delete(c.id!)}>
                  <Icone nome="lixo" tamanho={18} />
                </button>
              </div>
            </Entra>
          ))}
        </div>
      )}
      <p className="mini suave">
        Parcelas este mês: {reais(compromissoDoMes(compras))} · no mês que vem: {reais(compromissoDoMes(compras, proximoMes))} ({parcelasNoMes(compras, proximoMes).length} {parcelasNoMes(compras, proximoMes).length === 1 ? 'compra' : 'compras'}).
      </p>
    </main>
  );
}
