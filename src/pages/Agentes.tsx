import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar, PainelAgentes, useEquipe } from '../components/Equipe';
import { Icone } from '../components/Icone';
import { BotaoSalvar, Markdown } from '../components/Ui';
import { db, type Importancia, type TipoInvestimento, type TipoMov } from '../db';
import { acharPlano, AGENTES, baixar, gastoDoTexto, TELAS, impostoDoAno, perguntar, planilhaDoMes, prepararAnexo, resumoDoMes, type Acao, type IdAgente } from '../lib/agentes';
import { selicVista } from '../lib/agentesAvisos';
import { categorizar, NOMES_CATEGORIAS } from '../lib/categorias';
import { contextoDeCompra, recomendar } from '../lib/compras';
import { NOMES_FORMA } from '../lib/cartao';
import { conferirLimiteCartao } from '../lib/avisos';
import { jaRegistrado } from '../lib/conciliar';
import { chaveMes, dataCurta, mesLongo, reais } from '../lib/format';
import { chaveMovimento } from '../lib/importar';
import { situacaoPlano, useOnline } from '../hooks';

interface Mensagem {
  id: string;
  de: 'pessoa' | IdAgente;
  texto: string;
  anexo?: string;
  acoes?: Acao[];
  feitas?: number[];
}

const GUARDA = 'mp_conversa';
const lerConversa = (): Mensagem[] => {
  try {
    return JSON.parse(localStorage.getItem(GUARDA) ?? '[]') as Mensagem[];
  } catch {
    return [];
  }
};
const novoId = () => Math.random().toString(36).slice(2);

/** Chat com a equipe: Nina (gastos), Gabriela (planos), Matheus (investimentos) e Leo (antes de comprar). */
export default function Agentes() {
  const navegar = useNavigate();
  const online = useOnline();
  const equipe = useEquipe();
  const [conversa, setConversa] = useState<Mensagem[]>(lerConversa);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(false);
  const gravador = useRef<MediaRecorder>();
  const fim = useRef<HTMLDivElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(GUARDA, JSON.stringify(conversa.slice(-40)));
    } catch {
      /* sem armazenamento */
    }
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conversa]);
  useEffect(() => () => selicVista(equipe.selic), [equipe.selic]);

  const adicionar = (m: Omit<Mensagem, 'id'>) => setConversa((c) => [...c, { ...m, id: novoId() }]);

  async function enviar(msg: string, anexo?: { tipo: string; dados: string }, rotuloAnexo?: string) {
    if ((!msg.trim() && !anexo) || ocupado) return;
    setErro('');
    adicionar({ de: 'pessoa', texto: msg.trim(), anexo: rotuloAnexo });
    setTexto('');
    setOcupado(true);
    try {
      const historico = conversa.slice(-10).map((m) => ({ de: m.de === 'pessoa' ? ('pessoa' as const) : ('agente' as const), texto: m.de === 'pessoa' ? m.texto : `${AGENTES[m.de].nome}: ${m.texto}` }));
      const r = await perguntar(msg.trim(), historico, equipe.contexto(), anexo);
      // Se a IA esqueceu de sugerir o registro de um gasto contado em texto, o app prepara.
      const local = !r.acoes.some((a) => a.tipo === 'registrar') ? gastoDoTexto(msg) : null;
      adicionar({ de: local ? 'nina' : r.agente, texto: r.resposta, acoes: local ? [local, ...r.acoes] : r.acoes });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function escolherArquivo(f: File) {
    try {
      const a = await prepararAnexo(f);
      await enviar(texto, a, f.type.startsWith('image/') ? '📷 Foto' : f.type === 'application/pdf' ? `📄 ${f.name}` : '🎙️ Áudio');
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function gravar() {
    if (gravando) return gravador.current?.stop();
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(fluxo);
      const pedacos: Blob[] = [];
      r.ondataavailable = (e) => pedacos.push(e.data);
      r.onstop = async () => {
        fluxo.getTracks().forEach((t) => t.stop());
        setGravando(false);
        const blob = new Blob(pedacos, { type: r.mimeType || 'audio/webm' });
        if (blob.size < 1500) return;
        try {
          await enviar(texto, await prepararAnexo(blob), '🎙️ Áudio');
        } catch (e) {
          setErro((e as Error).message);
        }
      };
      gravador.current = r;
      r.start();
      setGravando(true);
      setTimeout(() => r.state === 'recording' && r.stop(), 60_000); // no máximo 1 minuto
    } catch {
      setErro('Não consegui usar o microfone. Permita o microfone para o app nas configurações do celular.');
    }
  }

  /** Ações rápidas feitas aqui no aparelho, sem IA. */
  const mes = chaveMes(new Date());
  const rapidas = [
    { rotulo: 'Resumo do mês', fazer: () => adicionar({ de: 'nina', texto: resumoDoMes(equipe.movimentos, mes, equipe.renda.mensal) }) },
    { rotulo: 'Planilha do mês', fazer: () => adicionar({ de: 'nina', texto: `Planilha de ${mesLongo(mes)} pronta.`, acoes: [{ tipo: 'relatorio', mes }] }) },
    { rotulo: 'Imposto de Renda', fazer: () => adicionar({ de: 'nina', texto: impostoDoAno(equipe.movimentos, String(new Date().getFullYear())) }) },
  ];

  return (
    <main className="tela sem-nav chat">
      <div className="topo">
        <div className="linha">
          <button type="button" className="circulo escuro" aria-label="Voltar" onClick={() => navegar(-1)}><Icone nome="voltar" /></button>
          <h1 className="titulo" style={{ fontSize: 24 }}>Agentes</h1>
        </div>
        {conversa.length > 0 && (
          <button type="button" className="pequeno" style={{ background: 'none', border: 0, color: 'var(--suave)', cursor: 'pointer' }} onClick={() => confirm('Apagar a conversa deste aparelho?') && setConversa([])}>
            Limpar
          </button>
        )}
      </div>

      <div className="equipe">
        {(Object.keys(AGENTES) as IdAgente[]).map((id) => (
          <button key={id} type="button" className="membro" onClick={() => setTexto(`${AGENTES[id].nome}, `)}>
            <Avatar id={id} tamanho={44} />
            <strong className="pequeno">{AGENTES[id].nome}</strong>
            <span className="mini suave">{AGENTES[id].papel}</span>
          </button>
        ))}
      </div>

      {conversa.length === 0 && (
        <>
          <PainelAgentes />
        </>
      )}

      <div className="mensagens" aria-live="polite">
        {conversa.map((m) =>
          m.de === 'pessoa' ? (
            <div key={m.id} className="balao pessoa">
              {m.anexo && <span className="mini">{m.anexo}</span>}
              {m.texto && <span>{m.texto}</span>}
            </div>
          ) : (
            <div key={m.id} className="linha" style={{ alignItems: 'flex-start' }}>
              <Avatar id={m.de} />
              <div className="balao agente">
                <strong className="mini" style={{ color: AGENTES[m.de].cor }}>{AGENTES[m.de].nome}</strong>
                <Markdown texto={m.texto} />
                {(m.acoes ?? []).map((a, i) => (
                  <CartaoAcao
                    key={i}
                    acao={a}
                    feita={m.feitas?.includes(i)}
                    aoFazer={() => setConversa((c) => c.map((x) => (x.id === m.id ? { ...x, feitas: [...(x.feitas ?? []), i] } : x)))}
                    equipe={equipe}
                  />
                ))}
              </div>
            </div>
          ),
        )}
        <AnimatePresence>
          {ocupado && (
            <motion.div className="balao agente digitando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span /> <span /> <span />
            </motion.div>
          )}
        </AnimatePresence>
        {erro && <p className="cartao areia pequeno">{erro}</p>}
        <div ref={fim} />
      </div>

      <div className="chips" style={{ marginTop: 4 }}>
        {rapidas.map((r) => (
          <button key={r.rotulo} type="button" className="chip" onClick={r.fazer}>{r.rotulo}</button>
        ))}
      </div>

      <form
        className="barra-chat"
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
      >
        <button type="button" className="circulo card" aria-label="Enviar foto ou PDF do comprovante" onClick={() => arquivo.current?.click()} disabled={!online || ocupado}>
          <Icone nome="upload" tamanho={20} />
        </button>
        <input ref={arquivo} type="file" accept="image/*,application/pdf,audio/*" className="sr-only" onChange={(e) => e.target.files?.[0] && escolherArquivo(e.target.files[0])} />
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              enviar(texto);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder={online ? 'Escreva, grave um áudio ou envie um comprovante…' : 'Sem internet'}
          aria-label="Mensagem para os agentes"
        />
        {texto.trim() ? (
          <button type="submit" className="circulo terracota" aria-label="Enviar" disabled={!online || ocupado}><Icone nome="seta" tamanho={20} /></button>
        ) : (
          <button type="button" className={`circulo ${gravando ? 'terracota gravando' : 'verde'}`} aria-label={gravando ? 'Parar e enviar o áudio' : 'Gravar áudio'} onClick={gravar} disabled={!online || ocupado}>
            {gravando ? <span className="ponto-gravando" /> : <Icone nome="microfone" tamanho={20} />}
          </button>
        )}
      </form>
      <p className="mini suave" style={{ textAlign: 'center' }}>
        Para responder, a equipe recebe um resumo dos seus números (nunca senha ou dados do banco). Nada é salvo sem você confirmar.
      </p>
    </main>
  );
}

/** Uma ação sugerida pelo agente, executada aqui no aparelho só depois do toque da pessoa. */
function CartaoAcao({ acao, feita, aoFazer, equipe }: { acao: Acao; feita?: boolean; aoFazer: () => void; equipe: ReturnType<typeof useEquipe> }) {
  const navegar = useNavigate();
  const [msg, setMsg] = useState('');

  if (acao.tipo === 'registrar' && acao.valor) {
    const tipo: TipoMov = acao.tipoMov === 'entrada' ? 'entrada' : 'saida';
    const local = (acao.local ?? '').trim();
    const categoria = tipo === 'entrada' ? 'Entrada' : acao.categoria && NOMES_CATEGORIAS.includes(acao.categoria) ? acao.categoria : categorizar(local, tipo);
    const data = acao.data && /^\d{4}-\d{2}-\d{2}$/.test(acao.data) ? new Date(`${acao.data}T12:00:00`).toISOString() : new Date().toISOString();
    const igual = jaRegistrado({ valor: acao.valor, tipo, data, local }, equipe.movimentos);
    const forma = tipo === 'saida' ? (['credito', 'debito', 'pix', 'dinheiro', 'boleto'] as const).find((f) => f === acao.forma) : undefined;
    const parcelas = forma === 'credito' && acao.parcelas && acao.parcelas > 1 ? Math.min(48, Math.round(acao.parcelas)) : undefined;
    return (
      <div className="acao">
        <span className="pequeno">
          {tipo === 'saida' ? 'Gasto' : 'Entrada'} de <strong>{reais(acao.valor)}</strong>
          {local ? <> em <strong>{local}</strong></> : ''} · {categoria} · {dataCurta(data)}
          {forma ? ` · ${NOMES_FORMA[forma]}${parcelas ? ` em ${parcelas}x` : ''}` : ''}
        </span>
        {tipo === 'saida' && !forma && !feita && <span className="mini suave">Depois de registrar, o app pergunta se foi no débito ou no crédito.</span>}
        {igual && !feita && <span className="mini">Parece já registrado: {reais(igual.valor)}{igual.local ? ` em ${igual.local}` : ''} ({dataCurta(igual.data)}).</span>}
        {feita ? (
          <span className="mini">✓ Registrado</span>
        ) : (
          <div className="grade-2">
            <button
              type="button"
              className="botao pequeno"
              onClick={async () => {
                await db.movimentos.add({
                  data,
                  valor: acao.valor!,
                  tipo,
                  descricao: local || (tipo === 'saida' ? 'Gasto' : 'Entrada'),
                  local: local || undefined,
                  localPendente: !local,
                  categoria,
                  origem: 'manual',
                  chave: `${chaveMovimento(data, acao.valor!, local, tipo)}-${Date.now()}`,
                  ...(tipo === 'saida' ? { forma, parcelas, formaPendente: !forma } : {}),
                });
                if (forma === 'credito') conferirLimiteCartao().catch(() => undefined);
                aoFazer();
              }}
            >
              {igual ? 'Registrar mesmo assim' : 'Registrar'}
            </button>
            <button type="button" className="botao secundario pequeno" onClick={() => navegar(`/lancar?valor=${acao.valor}&local=${encodeURIComponent(local)}&tipo=${tipo}${forma ? `&forma=${forma}` : ''}${parcelas ? `&parcelas=${parcelas}` : ''}`)}>Editar</button>
          </div>
        )}
      </div>
    );
  }

  if (acao.tipo === 'avaliar_compra' && acao.valor) {
    const importancia: Importancia = acao.importancia === 'necessidade' || acao.importancia === 'util' ? acao.importancia : 'desejo';
    const aportePlanos = equipe.planos.reduce((a, p) => a + situacaoPlano(p, equipe.investimentos, equipe.livre, equipe.selic).meuAporte, 0);
    const rec = recomendar(
      { valor: acao.valor, importancia, maxSemJuros: Math.max(1, acao.maxSemJuros ?? 1), noCartao: acao.noCartao ?? true },
      contextoDeCompra({ perfil: equipe.perfil, compras: equipe.compras, movimentos: equipe.movimentos, renda: equipe.renda.mensal, livre: equipe.livre, aportePlanos }),
    );
    return (
      <div className="acao">
        <strong className="pequeno">{rec.titulo}</strong>
        {rec.explicacao.slice(0, 3).map((e) => <span key={e} className="mini">{e}</span>)}
        {rec.alertas.map((e) => <span key={e} className="mini" style={{ color: 'var(--terracota-texto)' }}>{e}</span>)}
        <Link to="/compra" className="botao secundario pequeno">Ver detalhes em Antes de comprar</Link>
      </div>
    );
  }

  if (acao.tipo === 'criar_plano') {
    const tipo = ['casa', 'carro', 'equipamentos', 'viagem', 'outro'].includes(acao.tipoPlano ?? '') ? acao.tipoPlano : 'outro';
    return (
      <div className="acao">
        <button type="button" className="botao pequeno" onClick={() => navegar(`/planos/novo?tipo=${tipo}`)}>
          Criar o plano {acao.nome ? `“${acao.nome}”` : ''}
        </button>
      </div>
    );
  }

  if (acao.tipo === 'relatorio' || acao.tipo === 'resumo') {
    const m = acao.mes && /^\d{4}-\d{2}$/.test(acao.mes) ? acao.mes : chaveMes(new Date());
    return (
      <div className="acao">
        <Markdown texto={resumoDoMes(equipe.movimentos, m, equipe.renda.mensal)} />
        {acao.tipo === 'relatorio' && (
          <button
            type="button"
            className="botao pequeno"
            onClick={() => {
              baixar(planilhaDoMes(equipe.movimentos, m), `meus-planos-${m}.csv`);
              setMsg('Planilha baixada. Ela abre no Excel, no Planilhas Google ou no Numbers.');
            }}
          >
            <Icone nome="baixar" tamanho={18} /> Baixar planilha
          </button>
        )}
        {msg && <span className="mini">{msg}</span>}
      </div>
    );
  }

  const feitoOu = (botao: React.ReactNode) => (feita ? <span className="mini">✓ Feito</span> : botao);

  if (acao.tipo === 'renda' && acao.valor) {
    return (
      <div className="acao">
        <span className="pequeno">Renda mensal: <strong>{reais(acao.valor)}</strong> (hoje: {reais(equipe.renda.mensal)})</span>
        {feitoOu(
          <button type="button" className="botao pequeno" onClick={async () => { await db.perfil.update('eu', { rendaMensal: acao.valor!, rendaAtualizadaEm: new Date().toISOString() }); aoFazer(); }}>
            Atualizar renda
          </button>,
        )}
      </div>
    );
  }

  if ((acao.tipo === 'guardar' || acao.tipo === 'porcentagem') && acao.nome) {
    const p = acharPlano(equipe.planos, acao.nome);
    if (!p) return <div className="acao"><span className="mini">Não encontrei o plano “{acao.nome}”. Confira o nome em Planos.</span></div>;
    if (acao.tipo === 'guardar' && acao.valor)
      return (
        <div className="acao">
          <span className="pequeno">Somar <strong>{reais(acao.valor)}</strong> ao plano <strong>{p.nome}</strong> (hoje {reais(p.guardado)} fora dos investimentos)</span>
          {feitoOu(<button type="button" className="botao pequeno" onClick={async () => { await db.planos.update(p.id!, { guardado: p.guardado + acao.valor! }); aoFazer(); }}>Somar ao plano</button>)}
        </div>
      );
    const pctNovo = Math.max(0, Math.min(100, Math.round(acao.percentual ?? 0)));
    const soma = equipe.planos.reduce((a, x) => a + (x.id === p.id ? pctNovo : x.percentual), 0);
    return (
      <div className="acao">
        <span className="pequeno"><strong>{p.nome}</strong>: de {p.percentual}% para <strong>{pctNovo}%</strong> do valor livre ({reais((equipe.livre * pctNovo) / 100)}/mês)</span>
        {soma > 100 && <span className="mini" style={{ color: 'var(--terracota-texto)' }}>Com isso, os planos somam {soma}% do valor livre (mais de 100%).</span>}
        {feitoOu(<button type="button" className="botao pequeno" onClick={async () => { await db.planos.update(p.id!, { percentual: pctNovo }); aoFazer(); }}>Mudar porcentagem</button>)}
      </div>
    );
  }

  if (acao.tipo === 'investimento' && acao.nome) {
    const tipos: TipoInvestimento[] = ['cofrinho', 'cdb', 'tesouro-selic', 'tesouro-ipca', 'tesouro-prefixado', 'lci-lca', 'poupanca', 'fundo', 'acoes-etf', 'cripto', 'outro'];
    const tipo = tipos.includes(acao.tipoInvestimento as TipoInvestimento) ? (acao.tipoInvestimento as TipoInvestimento) : 'outro';
    const existente = acharPlano(equipe.investimentos, acao.nome);
    const plano = acharPlano(equipe.planos, acao.plano);
    return (
      <div className="acao">
        <span className="pequeno">
          {existente ? 'Atualizar' : 'Novo'} investimento <strong>{existente?.nome ?? acao.nome}</strong>
          {acao.saldo !== undefined && acao.saldo !== null ? <> · saldo {reais(acao.saldo)}</> : ''}
          {acao.aporteMensal ? <> · {reais(acao.aporteMensal)}/mês</> : ''}
          {plano ? <> · plano {plano.nome}</> : ''}
        </span>
        {feitoOu(
          <button
            type="button"
            className="botao pequeno"
            onClick={async () => {
              const agora = new Date().toISOString();
              if (existente) await db.investimentos.update(existente.id!, { ...(acao.saldo != null ? { saldo: acao.saldo } : {}), ...(acao.aporteMensal != null ? { aporte: acao.aporteMensal, frequencia: 'mensal' as const } : {}), ...(plano ? { planoId: plano.id } : {}), atualizadoEm: agora });
              else await db.investimentos.add({ nome: acao.nome!, tipo, instituicao: '', saldo: acao.saldo ?? 0, aporte: acao.aporteMensal ?? 0, frequencia: 'mensal', planoId: plano?.id, atualizadoEm: agora });
              aoFazer();
            }}
          >
            {existente ? 'Atualizar investimento' : 'Adicionar investimento'}
          </button>,
        )}
      </div>
    );
  }

  const diaOk = (d?: number | null) => (d && d >= 1 && d <= 31 ? Math.round(d) : undefined);
  if (acao.tipo === 'cartao' && (acao.limite || acao.usado != null || diaOk(acao.fechamento) || diaOk(acao.vencimento))) {
    const partes = [
      acao.limite ? `limite ${reais(acao.limite)}` : '',
      acao.usado != null ? `usado ${reais(acao.usado)}` : '',
      diaOk(acao.fechamento) ? `fecha dia ${diaOk(acao.fechamento)}` : '',
      diaOk(acao.vencimento) ? `vence dia ${diaOk(acao.vencimento)}` : '',
    ].filter(Boolean);
    return (
      <div className="acao">
        <span className="pequeno">Cartão: <strong>{partes.join(' · ')}</strong></span>
        {feitoOu(
          <BotaoSalvar
            className="botao pequeno"
            depois={aoFazer}
            aoSalvar={async () => {
              await db.perfil.update('eu', {
                ...(acao.limite ? { limiteCartao: acao.limite } : {}),
                ...(acao.usado != null ? { limiteUsado: acao.usado, limiteUsadoEm: new Date().toISOString() } : {}),
                ...(diaOk(acao.fechamento) ? { cartaoFechamento: diaOk(acao.fechamento) } : {}),
                ...(diaOk(acao.vencimento) ? { cartaoVencimento: diaOk(acao.vencimento) } : {}),
              });
            }}
          >
            Salvar no app
          </BotaoSalvar>,
        )}
      </div>
    );
  }

  if (acao.tipo === 'assinatura' && acao.nome && acao.valor) {
    const ciclo: 'mensal' | 'anual' = acao.ciclo === 'anual' ? 'anual' : 'mensal';
    const dia = Math.min(31, Math.max(1, Math.round(acao.dia ?? new Date().getDate())));
    const existe = (equipe.perfil?.assinaturas ?? []).find((a) => a.nome.toLowerCase() === acao.nome!.toLowerCase());
    return (
      <div className="acao">
        <span className="pequeno">{existe ? 'Atualizar' : 'Nova'} assinatura <strong>{acao.nome}</strong> · {reais(acao.valor)} {ciclo === 'anual' ? 'por ano' : 'por mês'} · dia {dia}</span>
        {feitoOu(
          <button
            type="button"
            className="botao pequeno"
            onClick={async () => {
              const { SERVICOS } = await import('../lib/assinaturas');
              const servico = SERVICOS.find((s) => s.nome.toLowerCase().includes(acao.nome!.toLowerCase()) || acao.nome!.toLowerCase().includes(s.nome.toLowerCase().split(' ')[0]));
              const lista = equipe.perfil?.assinaturas ?? [];
              const nova = { id: existe?.id ?? Math.random().toString(36).slice(2, 10), servico: existe?.servico ?? servico?.id, nome: existe?.nome ?? servico?.nome ?? acao.nome!, valor: acao.valor!, ciclo, dia, mes: ciclo === 'anual' ? (acao.mesCobranca ?? new Date().getMonth() + 1) : undefined };
              await db.perfil.update('eu', { assinaturas: existe ? lista.map((a) => (a.id === existe.id ? nova : a)) : [...lista, nova], assinaturasRespondido: true });
              aoFazer();
            }}
          >
            {existe ? 'Atualizar assinatura' : 'Adicionar assinatura'}
          </button>,
        )}
      </div>
    );
  }

  if (acao.tipo === 'tela' && acao.tela && TELAS[acao.tela]) {
    return (
      <div className="acao">
        <button type="button" className="botao secundario pequeno" onClick={() => navegar(TELAS[acao.tela!].rota)}>Abrir {TELAS[acao.tela].nome}</button>
      </div>
    );
  }

  if (acao.tipo === 'imposto') {
    const ano = acao.ano && /^\d{4}$/.test(acao.ano) ? acao.ano : String(new Date().getFullYear());
    return (
      <div className="acao">
        <Markdown texto={impostoDoAno(equipe.movimentos, ano)} />
      </div>
    );
  }
  return null;
}
