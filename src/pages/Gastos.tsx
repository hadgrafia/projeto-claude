import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icone, ICONE_CATEGORIA } from '../components/Icone';
import { BotaoSalvar, CampoDinheiro, Dinheiro, Folha, Segmentado } from '../components/Ui';
import { db, type FormaPag, type Movimento, type OrigemMov, type TipoMov } from '../db';
import { CampoForma } from '../components/FormaPagamento';
import { conferirLimiteCartao } from '../lib/avisos';
import { useDados } from '../hooks';
import { categorizar, ehEssencial, NOMES_CATEGORIAS } from '../lib/categorias';
import { analisarMes, type Status } from '../lib/feedback';
import { hora, reais } from '../lib/format';
import { chaveMovimento } from '../lib/importar';
import { CampoLugar, CartaoCompletar, useLugaresRecentes } from '../components/Lugar';
import { lugarInformadoNoApp, esquecerAviso, naoEraGasto } from '../lib/nativo';
import { BotaoOlho } from '../components/OlhoValores';

type Periodo = 'dia' | 'semana' | 'mes' | 'ano';

function intervalo(p: Periodo, deslocamento: number, hoje = new Date()): [Date, Date, string] {
  const d = new Date(hoje);
  d.setHours(0, 0, 0, 0);
  if (p === 'dia') {
    d.setDate(d.getDate() + deslocamento);
    const fim = new Date(d);
    fim.setDate(fim.getDate() + 1);
    const rot = deslocamento === 0 ? 'Hoje' : deslocamento === -1 ? 'Ontem' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    return [d, fim, rot];
  }
  if (p === 'semana') {
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + deslocamento * 7);
    const fim = new Date(d);
    fim.setDate(fim.getDate() + 7);
    const ult = new Date(fim.getTime() - 1);
    return [d, fim, `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${ult.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`];
  }
  if (p === 'mes') {
    const ini = new Date(d.getFullYear(), d.getMonth() + deslocamento, 1);
    return [ini, new Date(ini.getFullYear(), ini.getMonth() + 1, 1), ini.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })];
  }
  const ini = new Date(d.getFullYear() + deslocamento, 0, 1);
  return [ini, new Date(ini.getFullYear() + 1, 0, 1), String(ini.getFullYear())];
}

export default function Gastos() {
  const { movimentos, renda } = useDados();
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [desl, setDesl] = useState(0);
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<Movimento>();
  const [ini, fim, rotulo] = intervalo(periodo, desl);

  const doPeriodo = useMemo(
    () => movimentos.filter((m) => { const t = new Date(m.data).getTime(); return t >= ini.getTime() && t < fim.getTime(); }),
    [movimentos, ini, fim],
  );
  const entrou = doPeriodo.filter((m) => m.tipo === 'entrada').reduce((a, m) => a + m.valor, 0);
  const saiu = doPeriodo.filter((m) => m.tipo === 'saida').reduce((a, m) => a + m.valor, 0);
  const status = useMemo(() => new Map(analisarMes(movimentos, renda.mensal).map((s) => [s.categoria, s.status] as [string, Status])), [movimentos, renda.mensal]);
  const porDia = useMemo(() => {
    const g = new Map<string, Movimento[]>();
    for (const m of doPeriodo) {
      const k = new Date(m.data).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(m);
    }
    return [...g];
  }, [doPeriodo]);
  const porCategoria = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of doPeriodo) if (m.tipo === 'saida') c.set(m.categoria, (c.get(m.categoria) ?? 0) + m.valor);
    return [...c].sort((a, b) => b[1] - a[1]);
  }, [doPeriodo]);

  return (
    <main className="tela">
      <div className="topo">
        <h1 className="titulo">Gastos e entradas</h1>
        <div className="linha" style={{ gap: 8 }}>
          <BotaoOlho />
          <Link to="/importar" className="circulo card" aria-label="Enviar extrato">
            <Icone nome="upload" tamanho={20} />
          </Link>
        </div>
      </div>

      <Segmentado
        rotulo="Período"
        valor={periodo}
        aoMudar={(p) => { setPeriodo(p); setDesl(0); }}
        opcoes={[{ valor: 'dia', rotulo: 'Dia' }, { valor: 'semana', rotulo: 'Semana' }, { valor: 'mes', rotulo: 'Mês' }, { valor: 'ano', rotulo: 'Ano' }]}
      />
      <div className="topo">
        <button type="button" className="circulo card" aria-label="Período anterior" onClick={() => setDesl(desl - 1)}><Icone nome="voltar" /></button>
        <strong>{rotulo.charAt(0).toUpperCase() + rotulo.slice(1)}</strong>
        <button type="button" className="circulo card" aria-label="Próximo período" disabled={desl >= 0} style={{ opacity: desl >= 0 ? 0.4 : 1 }} onClick={() => setDesl(desl + 1)}>
          <Icone nome="direita" />
        </button>
      </div>

      <div className="grade-2">
        <div className="cartao manter" style={{ gap: 2 }}>
          <span className="mini" style={{ fontWeight: 600 }}>Entrou</span>
          <Dinheiro valor={entrou} centavos className="num" />
        </div>
        <div className="cartao terracota" style={{ gap: 2 }}>
          <span className="mini" style={{ fontWeight: 600 }}>Saiu</span>
          <Dinheiro valor={saiu} centavos className="num" />
        </div>
      </div>

      {porCategoria.length > 0 && (
        <div className="cartao" style={{ gap: 8 }}>
          <span className="secao" style={{ marginTop: 0 }}>Para onde foi</span>
          {porCategoria.slice(0, 5).map(([c, v], i) => (
            <div key={c} className="coluna" style={{ gap: 4 }}>
              <div className="entre pequeno"><span>{c}</span><strong className="num">{reais(v)}</strong></div>
              <div className="barra" style={{ height: 6 }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${(v / porCategoria[0][1]) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.05 }} style={{ background: ehEssencial(c) ? 'var(--verde)' : 'var(--terracota)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <CartaoCompletar />

      <button type="button" className="botao terracota" onClick={() => setNovo(true)}>
        <Icone nome="mais" /> Anotar gasto ou entrada
      </button>

      {porDia.length === 0 && <p className="vazio">Nada registrado neste período.</p>}
      <AnimatePresence initial={false}>
        {porDia.map(([dia, itens]) => (
          <motion.section key={dia} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="coluna">
            <h2 className="secao" style={{ textTransform: 'uppercase' }}>{dia}</h2>
            <div className="lista">
              {itens.map((m) => {
                const st = m.tipo === 'saida' ? status.get(m.categoria) : undefined;
                return (
                  <button key={m.id} type="button" className="item" onClick={() => setEditando(m)}>
                    <span className={`circulo ${m.tipo === 'entrada' ? 'manter' : st === 'cortar' ? 'terracota' : st === 'rever' ? 'rever' : 'manter'}`}>
                      <Icone nome={ICONE_CATEGORIA[m.categoria] ?? 'etiqueta'} />
                    </span>
                    <span className="cresce coluna" style={{ gap: 2 }}>
                      {m.local ? (
                        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.local}</strong>
                      ) : (
                        <strong style={{ color: 'var(--terracota-texto)' }}>{m.tipo === 'entrada' ? 'De onde veio?' : 'Onde foi?'} Toque para informar</strong>
                      )}
                      <span className="pequeno suave">
                        {m.categoria} · {m.origem === 'extrato' ? 'extrato' : hora(m.data)}
                        {m.avisadoPor ? ` · ${m.avisadoPor}` : ''}
                        {m.forma === 'credito' ? ` · crédito${m.parcelaAtual && m.parcelas ? ` ${m.parcelaAtual}/${m.parcelas}` : m.parcelas && m.parcelas > 1 ? ` ${m.parcelas}x` : ''}` : m.forma ? ` · ${m.forma === 'debito' ? 'débito' : m.forma}` : ''}
                      </span>
                      {m.formaPendente && <span className="mini" style={{ color: 'var(--terracota-texto)', fontWeight: 600 }}>Débito ou crédito? Toque para dizer</span>}
                    </span>
                    <span className="coluna" style={{ alignItems: 'flex-end', gap: 4 }}>
                      <strong className="num" style={{ color: m.tipo === 'entrada' ? 'var(--manter-tx)' : undefined }}>{m.tipo === 'entrada' ? '+' : ''}{reais(m.valor)}</strong>
                      {st && st !== 'manter' && <span className={`pilula ${st}`}>{st === 'cortar' ? 'Cortar' : 'Rever'}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.section>
        ))}
      </AnimatePresence>

      <Folha aberta={novo} aoFechar={() => setNovo(false)} titulo="Anotar">
        <FormMovimento aoSalvar={() => setNovo(false)} />
      </Folha>
      <Folha aberta={!!editando} aoFechar={() => setEditando(undefined)} titulo="Editar lançamento">
        {editando && <FormMovimento mov={editando} aoSalvar={() => setEditando(undefined)} />}
      </Folha>
    </main>
  );
}

export function FormMovimento({ mov, aoSalvar, origem = 'manual' }: { mov?: Partial<Movimento>; aoSalvar: () => void; origem?: OrigemMov }) {
  const [tipo, setTipo] = useState<TipoMov>(mov?.tipo ?? 'saida');
  const [valor, setValor] = useState<number | undefined>(mov?.valor);
  const [local, setLocal] = useState(mov?.local ?? '');
  const sugestoes = useLugaresRecentes(tipo);
  const [categoria, setCategoria] = useState(mov?.categoria ?? '');
  const [forma, setForma] = useState<FormaPag | undefined>(mov?.forma);
  const [parcelas, setParcelas] = useState<number | undefined>(mov?.parcelas);
  const agora = new Date();
  const paraCampo = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [quando, setQuando] = useState(paraCampo(mov?.data ? new Date(mov.data) : agora));

  async function salvar() {
    if (!valor || !local.trim()) return false;
    const data = new Date(quando).toISOString();
    const lugar = local.trim();
    const auto = categorizar(lugar, tipo);
    const cat = tipo === 'entrada' ? 'Entrada' : categoria || (mov?.categoria && mov.categoria !== 'Outros' && auto === 'Outros' ? mov.categoria : auto);
    const pagamento = tipo === 'saida' ? { forma, parcelas: forma === 'credito' && parcelas && parcelas > 1 ? parcelas : undefined, formaPendente: !forma && Boolean(mov?.formaPendente) } : { forma: undefined, parcelas: undefined, formaPendente: false };
    const dados = { data, valor, tipo, descricao: mov?.id && mov.descricao && mov.origem !== 'manual' ? mov.descricao : lugar, local: lugar, localPendente: false, categoria: cat, ...pagamento };
    if (mov?.id) {
      await db.movimentos.update(mov.id, dados);
      if (mov.localPendente && mov.chave) lugarInformadoNoApp(mov.chave);
    }
    else await db.movimentos.add({ ...dados, origem, chave: `${chaveMovimento(data, valor, lugar, tipo)}-${Date.now()}`, ...(mov?.modelo ? { modelo: mov.modelo } : {}) });
    if (tipo === 'saida' && forma === 'credito') conferirLimiteCartao().catch(() => undefined);
  }

  return (
    <>
      <Segmentado rotulo="Tipo" valor={tipo} aoMudar={setTipo} opcoes={[{ valor: 'saida', rotulo: 'Gasto' }, { valor: 'entrada', rotulo: 'Entrada' }]} />
      <CampoDinheiro rotulo="Valor" valor={valor} aoMudar={setValor} />
      <CampoLugar tipo={tipo} valor={local} aoMudar={setLocal} sugestoes={sugestoes} />
      {tipo === 'saida' && (
        <label className="campo">
          Categoria
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Automática</option>
            {NOMES_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      )}
      {tipo === 'saida' && (
        <CampoForma
          forma={forma}
          parcelas={parcelas}
          aoMudar={(f, n) => {
            setForma(f);
            setParcelas(n);
          }}
        />
      )}
      {tipo === 'saida' && forma === 'credito' && (parcelas ?? 1) > 1 && valor ? <span className="mini suave">{parcelas}x de {reais(valor / parcelas!)} na fatura do cartão.</span> : null}
      <label className="campo">
        Data e hora
        <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
      </label>
      <BotaoSalvar aoSalvar={salvar} depois={aoSalvar} disabled={!valor || !local.trim()} />
      {mov?.id && mov.origem === 'notificacao' && <NaoEraGasto mov={mov as Movimento} aoTerminar={aoSalvar} />}
      {mov?.id && (
        <button type="button" className="botao perigo" onClick={async () => { await db.movimentos.delete(mov.id!); if (mov.chave) await esquecerAviso(mov.chave); aoSalvar(); }}>
          <Icone nome="lixo" /> Apagar
        </button>
      )}
    </>
  );
}

/**
 * Lançamento que veio de um aviso e não era gasto (ex.: cotação do dólar, propaganda):
 * apaga este e os outros do mesmo tipo de aviso, e avisos iguais passam a ser ignorados.
 */
function NaoEraGasto({ mov, aoTerminar }: { mov: Movimento; aoTerminar: () => void }) {
  const iguais = useLiveQuery(() => (mov.modelo ? db.movimentos.filter((m) => m.modelo === mov.modelo).count() : Promise.resolve(1)), [mov.modelo]) ?? 1;
  return (
    <div className="cartao areia" style={{ gap: 8, padding: 14 }}>
      <span className="pequeno">
        <strong>Isto não foi um gasto?</strong> (ex.: aviso da cotação do dólar, propaganda, simulação)
      </span>
      <BotaoSalvar
        className="botao secundario pequeno"
        salvo={iguais > 1 ? `${iguais} apagados` : 'Apagado'}
        aoSalvar={() => naoEraGasto(mov)}
        depois={aoTerminar}
      >
        Não era um gasto{iguais > 1 ? `: apagar os ${iguais} iguais` : ''} e ignorar avisos assim
      </BotaoSalvar>
      {!mov.modelo && <span className="mini suave">Este lançamento é de uma versão anterior do app. Avisos iguais a partir de agora já são reconhecidos pelo app novo.</span>}
    </div>
  );
}
