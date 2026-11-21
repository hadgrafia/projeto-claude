import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar, PainelAgentes, useEquipe } from '../components/Equipe';
import { Icone } from '../components/Icone';
import { Markdown } from '../components/Ui';
import { db, type Importancia, type TipoMov } from '../db';
import { AGENTES, baixar, gastoDoTexto, impostoDoAno, perguntar, planilhaDoMes, prepararAnexo, resumoDoMes, type Acao, type IdAgente } from '../lib/agentes';
import { selicVista } from '../lib/agentesAvisos';
import { categorizar, NOMES_CATEGORIAS } from '../lib/categorias';
import { compromissoDoMes, limiteDisponivel, recomendar } from '../lib/compras';
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
          <section className="cartao">
            <strong>Experimente</strong>
            <div className="chips">
              {(Object.keys(AGENTES) as IdAgente[]).map((id) => (
                <button key={id} type="button" className="chip" onClick={() => enviar(AGENTES[id].exemplo)} disabled={!online}>
                  {AGENTES[id].exemplo}
                </button>
              ))}
            </div>
            <span className="mini suave">Também dá para mandar áudio, foto ou PDF do comprovante.</span>
          </section>
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
          placeholder={online ? 'Escreva para a equipe…' : 'Sem internet'}
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
    return (
      <div className="acao">
        <span className="pequeno">
          {tipo === 'saida' ? 'Gasto' : 'Entrada'} de <strong>{reais(acao.valor)}</strong>
          {local ? <> em <strong>{local}</strong></> : ''} · {categoria} · {dataCurta(data)}
        </span>
        {igual && !feita && <span className="mini">Parece já registrado: {reais(igual.valor)}{igual.local ? ` em ${igual.local}` : ''} ({dataCurta(igual.data)}).</span>}
        {feita ? (
          <span className="mini">✓ Registrado</span>
        ) : (
          <div className="grade-2">
            <button
              type="button"
              className="botao pequeno"
              onClick={async () => {
                await db.movimentos.add({ data, valor: acao.valor!, tipo, descricao: local || (tipo === 'saida' ? 'Gasto' : 'Entrada'), local: local || undefined, localPendente: !local, categoria, origem: 'manual', chave: `${chaveMovimento(data, acao.valor!, local, tipo)}-${Date.now()}` });
                aoFazer();
              }}
            >
              {igual ? 'Registrar mesmo assim' : 'Registrar'}
            </button>
            <button type="button" className="botao secundario pequeno" onClick={() => navegar(`/lancar?valor=${acao.valor}&local=${encodeURIComponent(local)}&tipo=${tipo}`)}>Editar</button>
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
      {
        renda: equipe.renda.mensal,
        livre: equipe.livre,
        compromissoMensal: compromissoDoMes(equipe.compras),
        limiteDisponivel: limiteDisponivel(equipe.perfil?.limiteCartao, equipe.perfil?.limiteUsado, equipe.perfil?.limiteUsadoEm, equipe.compras),
        limiteTotal: equipe.perfil?.limiteCartao,
        aportePlanos,
      },
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
