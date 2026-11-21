import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icone, ICONE_PLANO } from '../components/Icone';
import { CampoDinheiro, Dinheiro, Folha } from '../components/Ui';
import { db, type TipoPlano } from '../db';
import { useDados, useSelic } from '../hooks';
import * as fipe from '../lib/fipe';
import { enviarDefinicao } from '../lib/conjunto';
import { CartaoPrazo } from '../components/Prazo';
import { analisarPrazo, taxaMensal } from '../lib/finance';
import { chaveMes, mesesEntre } from '../lib/format';
import { cdiDaSelic, liquidoAnual } from '../lib/invest';
import { lerValor, pct, reais, reaisCurto } from '../lib/format';
import { PLANOS, respostasPadrao, type Campo } from '../lib/planos';

export default function NovoPlano() {
  const navegar = useNavigate();
  const { id } = useParams();
  const [busca] = useSearchParams();
  const { livre, somaPct, renda, gasto, investimentos } = useDados();
  const selic = useSelic();
  const [tipo, setTipo] = useState<TipoPlano | undefined>((busca.get('tipo') as TipoPlano) || undefined);
  const [nome, setNome] = useState('');
  const [resp, setResp] = useState<Record<string, unknown>>({});
  const [percentual, setPercentual] = useState(0);
  const [guardado, setGuardado] = useState<number>();
  const [metaManual, setMetaManual] = useState<number>();
  const [fipeAberta, setFipeAberta] = useState(false);
  const [pctTocado, setPctTocado] = useState(false);
  const editando = Boolean(id);

  // Sugere a porcentagem que ainda está livre (os planos carregam depois da tela abrir).
  useEffect(() => {
    if (!id && !pctTocado) setPercentual(Math.max(0, Math.min(100, 100 - somaPct)));
  }, [somaPct, id, pctTocado]);

  useEffect(() => {
    if (id) {
      db.planos.get(Number(id)).then((p) => {
        if (!p) return;
        setTipo(p.tipo);
        setNome(p.nome);
        setResp(p.respostas);
        setPercentual(p.percentual);
        setGuardado(p.guardado);
        if (p.respostas.__metaManual) setMetaManual(Number(p.respostas.__metaManual));
      });
    }
  }, [id]);

  useEffect(() => {
    if (tipo && !id) {
      setResp(respostasPadrao(tipo));
      setNome(PLANOS[tipo].nomePadrao);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, id]);

  const def = tipo ? PLANOS[tipo] : undefined;
  const resultado = useMemo(() => (def ? def.calcular(resp) : undefined), [def, resp]);
  const meta = metaManual ?? resultado?.meta ?? 0;
  const prazo = (resp.prazo as string) || undefined;
  const horizonte = prazo ? Math.max(1, mesesEntre(chaveMes(new Date()), prazo)) : 24;
  const rendimentoAa = selic ? liquidoAnual(cdiDaSelic(selic.valor), 100, horizonte) : 0;
  const daLista = id ? investimentos.filter((i) => i.planoId === Number(id)).reduce((a, i) => a + i.saldo, 0) : 0;
  const analise = analisarPrazo({ meta, guardado: (guardado ?? 0) + daLista, livre, percentual, prazo, rendimentoMensal: taxaMensal(rendimentoAa) });
  const faltando = [!meta && 'a meta (preencha as perguntas acima)', !prazo && 'quando você quer atingir o plano'].filter(Boolean) as string[];
  const set = (k: string, v: unknown) => setResp((r) => ({ ...r, [k]: v }));

  async function salvar() {
    if (!tipo || !resultado) return;
    const dados = {
      nome: nome.trim() || PLANOS[tipo].nomePadrao,
      tipo,
      meta,
      guardado: guardado ?? 0,
      percentual,
      prazo: (resp.prazo as string) || undefined,
      respostas: { ...resp, __metaManual: metaManual },
      composicao: resultado.composicao,
    };
    if (id) {
      await db.planos.update(Number(id), dados);
      const salvo = await db.planos.get(Number(id));
      if (salvo?.conjunto) await enviarDefinicao(salvo).catch(() => alert('O plano foi salvo neste aparelho, mas não foi enviado ao grupo agora. Ele é atualizado quando a conexão voltar.'));
      navegar(`/planos/${id}`, { replace: true });
    } else {
      const novo = await db.planos.add({ ...dados, criadoEm: new Date().toISOString() });
      navegar(`/planos/${novo}`, { replace: true });
    }
  }

  if (!tipo || !def) {
    return (
      <main className="tela sem-nav">
        <Cabecalho titulo="Novo plano" />
        <p className="subtitulo">Escolha o tipo. Cada um faz as perguntas certas para calcular a sua meta.</p>
        <div className="grade-2">
          {(Object.keys(PLANOS) as TipoPlano[]).map((t, i) => (
            <motion.button key={t} type="button" whileTap={{ scale: 0.96 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="cartao" style={{ border: '1px solid var(--borda)', cursor: 'pointer', textAlign: 'left' }} onClick={() => setTipo(t)}>
              <span className={`circulo ${t === 'casa' ? 'terracota' : 'verde'}`}><Icone nome={ICONE_PLANO[t]} /></span>
              <strong>{PLANOS[t].nome}</strong>
            </motion.button>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="tela sem-nav">
      <Cabecalho titulo={editando ? 'Editar plano' : `Plano: ${def.nome}`} />

      <label className="campo">
        Nome do plano
        <input value={nome} onChange={(e) => setNome(e.target.value)} />
      </label>

      <section className="cartao" style={{ gap: 14 }}>
        {tipo === 'carro' && (
          <button type="button" className="botao secundario pequeno" onClick={() => setFipeAberta(true)}>
            <Icone nome="carro" /> Consultar Tabela FIPE
          </button>
        )}
        {def.campos.map((c) => (
          <CampoPlano key={c.id} campo={c} valor={resp[c.id]} aoMudar={(v) => set(c.id, v)} />
        ))}
      </section>

      {resultado && (
        <motion.section layout className="cartao terracota">
          <span className="pequeno" style={{ fontWeight: 600 }}>Meta calculada</span>
          <Dinheiro valor={meta} className="valor-grande" />
          {resultado.composicao.map((c) => (
            <div key={c.rotulo} className="entre pequeno"><span>{c.rotulo}</span><strong className="num">{reaisCurto(c.valor)}</strong></div>
          ))}
          {resultado.mensal && resultado.mensal.length > 0 && (
            <div className="coluna" style={{ gap: 4, borderTop: '1px solid rgba(255,255,255,0.35)', paddingTop: 8 }}>
              <span className="mini" style={{ fontWeight: 700 }}>Custo por mês depois</span>
              {resultado.mensal.map((c) => (
                <div key={c.rotulo} className="entre pequeno"><span>{c.rotulo}</span><span className="num">{reais(c.valor)}</span></div>
              ))}
              <div className="entre pequeno"><strong>Total</strong><strong className="num">{reais(resultado.mensal.reduce((a, b) => a + b.valor, 0))}</strong></div>
            </div>
          )}
        </motion.section>
      )}
      {resultado?.notas.map((n) => <p key={n} className="cartao areia pequeno">{n}</p>)}

      <CampoDinheiro rotulo="Prefere definir a meta você mesma?" valor={metaManual} aoMudar={setMetaManual} dica="Deixe vazio para usar a meta calculada." />
      <CampoDinheiro rotulo="Quanto já tem guardado para este plano?" valor={guardado} aoMudar={setGuardado} dica="Investimentos ligados ao plano somam automaticamente." />

      <section className="cartao verde">
        <div className="entre">
          <span>Porcentagem fixa do valor livre</span>
          <strong className="valor-grande" style={{ fontSize: 24 }}>{pct(percentual)}</strong>
        </div>
        <input type="range" min={0} max={100} step={5} value={percentual} onChange={(e) => { setPctTocado(true); setPercentual(Number(e.target.value)); }} aria-label="Porcentagem" style={{ accentColor: '#D9774F' }} />
        <span className="suave pequeno">= {reaisCurto((livre * percentual) / 100)} por mês, com base no seu valor livre de {reaisCurto(livre)}.</span>
      </section>

      <CartaoPrazo
        a={analise}
        prazo={prazo}
        percentual={percentual}
        renda={renda.mensal}
        gasto={gasto}
        rendimentoAa={rendimentoAa}
        aoUsarPct={(v) => { setPctTocado(true); setPercentual(v); }}
        aoUsarData={(m) => set('prazo', m)}
      />
      {faltando.length > 0 && <p className="cartao areia pequeno" role="status">Para continuar, responda: {faltando.join(' e ')}.</p>}

      <motion.button type="button" whileTap={{ scale: 0.97 }} className="botao seta" onClick={salvar} disabled={faltando.length > 0}>
        {editando ? 'Salvar alterações' : 'Criar plano'}
        <span className="ponta"><Icone nome="check" /></span>
      </motion.button>

      <Folha aberta={fipeAberta} aoFechar={() => setFipeAberta(false)} titulo="Tabela FIPE">
        <BuscaFipe
          aoEscolher={(r) => {
            setResp((x) => ({ ...x, marca: r.marca, modelo: r.modelo, ano: r.ano, preco: r.preco }));
            setFipeAberta(false);
          }}
        />
      </Folha>
    </main>
  );
}

function Cabecalho({ titulo }: { titulo: string }) {
  const navegar = useNavigate();
  return (
    <div className="linha">
      <button type="button" className="circulo escuro" aria-label="Voltar" onClick={() => navegar(-1)}><Icone nome="voltar" /></button>
      <h1 className="titulo" style={{ fontSize: 24 }}>{titulo}</h1>
    </div>
  );
}

function CampoPlano({ campo, valor, aoMudar }: { campo: Campo; valor: unknown; aoMudar: (v: unknown) => void }) {
  if (campo.tipo === 'dinheiro')
    return <CampoDinheiro rotulo={campo.rotulo} valor={typeof valor === 'number' ? valor : valor ? lerValor(String(valor)) : undefined} aoMudar={aoMudar} dica={campo.dica} />;
  if (campo.tipo === 'opcoes')
    return (
      <div className="campo">
        {campo.rotulo}
        <div className="chips" role="group" aria-label={campo.rotulo}>
          {campo.opcoes.map((o) => (
            <button key={o.valor} type="button" className="chip" aria-pressed={(valor ?? campo.padrao) === o.valor} onClick={() => aoMudar(o.valor)}>
              {o.rotulo}
            </button>
          ))}
        </div>
        {campo.dica && <span className="dica">{campo.dica}</span>}
      </div>
    );
  if (campo.tipo === 'lista')
    return (
      <label className="campo">
        {campo.rotulo}
        <textarea value={String(valor ?? '')} onChange={(e) => aoMudar(e.target.value)} placeholder={campo.dica} />
      </label>
    );
  return (
    <label className="campo">
      {campo.rotulo}
      <div className="com-sufixo">
        <input
          type={campo.tipo === 'mes' ? 'month' : 'text'}
          inputMode={campo.tipo === 'numero' ? 'decimal' : undefined}
          value={String(valor ?? '')}
          onChange={(e) => aoMudar(campo.tipo === 'numero' ? (e.target.value === '' ? '' : lerValor(e.target.value)) : e.target.value)}
        />
        {campo.tipo === 'numero' && campo.sufixo && <span>{campo.sufixo}</span>}
      </div>
      {'dica' in campo && campo.dica && <span className="dica">{campo.dica}</span>}
    </label>
  );
}

function BuscaFipe({ aoEscolher }: { aoEscolher: (r: { marca: string; modelo: string; ano: number; preco: number }) => void }) {
  const [marcas, setMarcas] = useState<fipe.Item[]>([]);
  const [modelos, setModelos] = useState<fipe.Item[]>([]);
  const [anos, setAnos] = useState<fipe.Item[]>([]);
  const [sel, setSel] = useState({ marca: '', modelo: '', ano: '' });
  const [res, setRes] = useState<Awaited<ReturnType<typeof fipe.preco>>>();
  const [erro, setErro] = useState('');

  useEffect(() => {
    fipe.marcas().then(setMarcas).catch((e: Error) => setErro(e.message));
  }, []);

  const escolher = async (k: 'marca' | 'modelo' | 'ano', v: string) => {
    setErro('');
    setRes(undefined);
    try {
      if (k === 'marca') {
        setSel({ marca: v, modelo: '', ano: '' });
        setAnos([]);
        setModelos(await fipe.modelos(v));
      } else if (k === 'modelo') {
        setSel((s) => ({ ...s, modelo: v, ano: '' }));
        setAnos(await fipe.anos(sel.marca, v));
      } else {
        setSel((s) => ({ ...s, ano: v }));
        setRes(await fipe.preco(sel.marca, sel.modelo, v));
      }
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  return (
    <>
      <label className="campo">Marca
        <select value={sel.marca} onChange={(e) => escolher('marca', e.target.value)}>
          <option value="">Escolha</option>
          {marcas.map((m) => <option key={m.codigo} value={m.codigo}>{m.nome}</option>)}
        </select>
      </label>
      <label className="campo">Modelo
        <select value={sel.modelo} disabled={!modelos.length} onChange={(e) => escolher('modelo', e.target.value)}>
          <option value="">Escolha</option>
          {modelos.map((m) => <option key={m.codigo} value={m.codigo}>{m.nome}</option>)}
        </select>
      </label>
      <label className="campo">Ano
        <select value={sel.ano} disabled={!anos.length} onChange={(e) => escolher('ano', e.target.value)}>
          <option value="">Escolha</option>
          {anos.map((m) => <option key={m.codigo} value={m.codigo}>{m.nome}</option>)}
        </select>
      </label>
      {erro && <p className="cartao areia pequeno">{erro}</p>}
      <AnimatePresence>
        {res && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="cartao verde">
            <span className="suave pequeno">{res.Marca} {res.Modelo} · {res.AnoModelo}</span>
            <strong className="valor-grande" style={{ fontSize: 30 }}>{res.Valor}</strong>
            <span className="suave mini">Tabela FIPE, referência {res.MesReferencia.trim()} · código {res.CodigoFipe}</span>
            <button
              type="button"
              className="botao terracota"
              onClick={() => aoEscolher({ marca: res.Marca, modelo: res.Modelo, ano: res.AnoModelo, preco: lerValor(res.Valor) })}
            >
              Usar este preço
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
