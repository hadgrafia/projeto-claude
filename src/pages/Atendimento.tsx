import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AvatarPessoa, ConversaChamado, EscreverMensagem } from '../components/Atendimento';
import { Icone } from '../components/Icone';
import { BotaoSalvar } from '../components/Ui';
import { useOnline } from '../hooks';
import { abrirChamado, listaChamados, mudarStatus, responder, type MensagemChamado, type ResumoChamado } from '../lib/atendimento';
import { souAdmin } from '../lib/pedidos';

const quando = (ms: number) => {
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

/** Equipe: chamados de atendimento (só o nome da pessoa) e a conversa de cada um. */
export default function Atendimento() {
  const { id } = useParams();
  const navegar = useNavigate();
  const online = useOnline();
  const [admin, setAdmin] = useState<boolean>();
  useEffect(() => {
    souAdmin().then(setAdmin).catch(() => setAdmin(false));
  }, []);
  if (admin === false) return <main className="tela sem-nav"><p className="vazio">Página não encontrada.</p></main>;
  if (!admin) return <main className="tela sem-nav"><p className="vazio">Carregando…</p></main>;
  if (!online) return <main className="tela sem-nav"><p className="vazio">Conecte-se à internet para ver os chamados.</p></main>;
  return id ? <Conversa id={id} aoVoltar={() => navegar('/atendimento')} /> : <Lista />;
}

function Lista() {
  const navegar = useNavigate();
  const [chamados, setChamados] = useState<ResumoChamado[]>();
  const [erro, setErro] = useState('');
  useEffect(() => {
    const carregar = () => listaChamados().then((r) => setChamados(r.chamados)).catch((e: Error) => setErro(e.message));
    carregar();
    const t = window.setInterval(carregar, 30_000);
    return () => window.clearInterval(t);
  }, []);
  const abertos = (chamados ?? []).filter((c) => c.status === 'aberto');
  const fechados = (chamados ?? []).filter((c) => c.status === 'fechado');
  const item = (c: ResumoChamado) => (
    <button key={c.id} type="button" className="item" onClick={() => navegar(`/atendimento/${c.id}`)}>
      <AvatarPessoa tamanho={40} destaque={c.naoLidas > 0} />
      <span className="cresce coluna" style={{ gap: 2 }}>
        <strong>{c.nome}</strong>
        <span className="mini suave">{c.status === 'aberto' ? 'Em aberto' : 'Encerrado'} · {quando(c.atualizadoEm)}</span>
      </span>
      {c.naoLidas > 0 && <span className="pilula terracota">{c.naoLidas} nova{c.naoLidas > 1 ? 's' : ''}</span>}
    </button>
  );
  return (
    <main className="tela sem-nav">
      <div className="topo">
        <div className="linha">
          <button type="button" className="circulo escuro" aria-label="Voltar" onClick={() => navegar(-1)}><Icone nome="voltar" /></button>
          <div className="coluna" style={{ gap: 2 }}>
            <h1 className="titulo" style={{ fontSize: 24 }}>Atendimento</h1>
            <span className="subtitulo">Só você vê. Para as pessoas, quem responde é "a equipe".</span>
          </div>
        </div>
      </div>
      {erro && <p className="cartao areia pequeno">{erro}</p>}
      <h2 className="secao">Em aberto ({abertos.length})</h2>
      {chamados && abertos.length === 0 && <p className="vazio">Nenhum chamado em aberto.</p>}
      <div className="lista">{abertos.map(item)}</div>
      {fechados.length > 0 && (
        <details>
          <summary className="secao" style={{ cursor: 'pointer' }}>Encerrados ({fechados.length})</summary>
          <div className="lista" style={{ marginTop: 8 }}>{fechados.map(item)}</div>
        </details>
      )}
    </main>
  );
}

function Conversa({ id, aoVoltar }: { id: string; aoVoltar: () => void }) {
  const [c, setC] = useState<{ nome: string; status: string; mensagens: MensagemChamado[] }>();
  const [erro, setErro] = useState('');
  const carregar = () => abrirChamado(id).then(setC).catch((e: Error) => setErro(e.message));
  useEffect(() => {
    carregar();
    const t = window.setInterval(carregar, 20_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return (
    <main className="tela sem-nav chat">
      <div className="topo">
        <div className="linha">
          <button type="button" className="circulo escuro" aria-label="Voltar" onClick={aoVoltar}><Icone nome="voltar" /></button>
          <AvatarPessoa tamanho={40} />
          <div className="coluna" style={{ gap: 0 }}>
            <strong>{c?.nome ?? '…'}</strong>
            <span className="mini suave">{c?.status === 'fechado' ? 'Encerrado' : 'Em aberto'}</span>
          </div>
        </div>
        {c && (
          <BotaoSalvar
            className="botao secundario pequeno"
            style={{ width: 'auto', padding: '8px 14px' }}
            salvo={c.status === 'fechado' ? 'Reaberto' : 'Encerrado'}
            aoSalvar={() => mudarStatus(id, c.status !== 'fechado')}
            depois={carregar}
          >
            {c.status === 'fechado' ? 'Reabrir' : 'Encerrar'}
          </BotaoSalvar>
        )}
      </div>
      {erro && <p className="cartao areia pequeno">{erro}</p>}
      {c && <ConversaChamado mensagens={c.mensagens} eu="equipe" nomeOutro={c.nome} />}
      <p className="mini suave" style={{ textAlign: 'center' }}>A pessoa vê a sua resposta como "Equipe".</p>
      <EscreverMensagem dica="Responder…" aoEnviar={async (t) => { await responder(id, t); await carregar(); }} />
    </main>
  );
}
