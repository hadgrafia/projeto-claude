import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AvatarPessoa, ConversaChamado, EscreverMensagem } from '../components/Atendimento';
import { Icone } from '../components/Icone';
import { db } from '../db';
import { useOnline } from '../hooks';
import { mandarMensagem, meuChamado, type MensagemChamado } from '../lib/atendimento';
import { buscarDuvidas, TEMAS, type Duvida } from '../lib/duvidas';
import { salvarCache } from '../db';

/**
 * Dúvidas: respostas prontas para as perguntas mais comuns e, se não resolver,
 * conversa com uma pessoa da equipe.
 */
export default function Ajuda() {
  const navegar = useNavigate();
  const [busca, setBusca] = useState('');
  const [tema, setTema] = useState<Duvida['tema'] | ''>('');
  const [params, setParams] = useSearchParams();
  const humano = params.get('pessoa') === '1';
  const lista = useMemo(() => buscarDuvidas(busca).filter((d) => !tema || d.tema === tema), [busca, tema]);

  if (humano) return <FalarComPessoa aoVoltar={() => setParams({})} />;

  return (
    <main className="tela sem-nav">
      <div className="topo">
        <div className="linha">
          <button type="button" className="circulo escuro" aria-label="Voltar" onClick={() => navegar(-1)}><Icone nome="voltar" /></button>
          <div className="coluna" style={{ gap: 2 }}>
            <h1 className="titulo" style={{ fontSize: 24 }}>Dúvidas</h1>
            <span className="subtitulo">Respostas rápidas para quem está começando</span>
          </div>
        </div>
      </div>

      <label className="campo">
        <span className="sr-only">Buscar dúvida</span>
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar: senha, cartão, iPhone, dólar…" />
      </label>
      <div className="chips">
        <button type="button" className="chip" aria-pressed={!tema} onClick={() => setTema('')}>Todas</button>
        {TEMAS.map((t) => (
          <button key={t} type="button" className="chip" aria-pressed={tema === t} onClick={() => setTema(t)}>{t}</button>
        ))}
      </div>

      <div className="coluna" style={{ gap: 8 }}>
        {lista.map((d) => (
          <details key={d.pergunta} className="cartao duvida" style={{ padding: '14px 16px', gap: 8 }}>
            <summary style={{ fontWeight: 700, cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              {d.pergunta}
              <Icone nome="direita" tamanho={18} />
            </summary>
            <p className="pequeno" style={{ marginTop: 8 }}>{d.resposta}</p>
            {d.tela && <Link to={d.tela.rota} className="chip" style={{ alignSelf: 'flex-start' }}>Abrir {d.tela.nome}</Link>}
          </details>
        ))}
        {lista.length === 0 && <p className="vazio">Nenhuma resposta pronta para isso. Fale com uma pessoa abaixo.</p>}
      </div>

      <button type="button" className="cartao cartao-link" style={{ flexDirection: 'row', alignItems: 'center', border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => setParams({ pessoa: '1' })}>
        <AvatarPessoa tamanho={44} destaque />
        <span className="cresce coluna" style={{ gap: 2 }}>
          <strong>Não encontrou a resposta?</strong>
          <span className="pequeno suave">Fale com uma pessoa da equipe. Ela responde aqui mesmo.</span>
        </span>
        <Icone nome="direita" />
      </button>
    </main>
  );
}

function FalarComPessoa({ aoVoltar }: { aoVoltar: () => void }) {
  const online = useOnline();
  const [mensagens, setMensagens] = useState<MensagemChamado[]>();
  const [fechado, setFechado] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = () =>
    meuChamado()
      .then((r) => {
        setMensagens(r.chamado?.mensagens ?? []);
        setFechado(r.chamado?.status === 'fechado');
        salvarCache('resposta-atendimento', 0).then(() => window.dispatchEvent(new Event('mp-chamados')));
      })
      .catch((e: Error) => setErro(navigator.onLine ? e.message : 'Sem internet. Conecte-se para falar com a equipe.'));
  useEffect(() => {
    if (!online) return;
    carregar();
    const t = window.setInterval(carregar, 20_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  return (
    <main className="tela sem-nav chat">
      <div className="topo">
        <div className="linha">
          <button type="button" className="circulo escuro" aria-label="Voltar" onClick={aoVoltar}><Icone nome="voltar" /></button>
          <AvatarPessoa tamanho={40} />
          <div className="coluna" style={{ gap: 0 }}>
            <strong>Atendimento</strong>
            <span className="mini suave">Uma pessoa da equipe responde aqui</span>
          </div>
        </div>
      </div>

      <div className="cartao areia pequeno" style={{ gap: 4 }}>
        <span>Conte a sua dúvida com detalhes. Uma pessoa (não é robô) lê e responde, normalmente em até 1 dia. Você recebe um aviso quando a resposta chegar.</span>
        <span className="mini suave">Nunca mande senha, número de cartão ou dados do banco.</span>
      </div>

      {mensagens && mensagens.length > 0 && <ConversaChamado mensagens={mensagens} eu="pessoa" nomeOutro="Equipe" />}
      {fechado && <p className="mini suave" style={{ textAlign: 'center' }}>Este atendimento foi encerrado. Mande uma nova mensagem se precisar de mais ajuda.</p>}
      {erro && <p className="cartao areia pequeno">{erro}</p>}

      <EscreverMensagem
        dica="Escreva a sua dúvida…"
        aoEnviar={async (t) => {
          const perfil = await db.perfil.get('eu');
          await mandarMensagem(t, perfil?.nome ?? '');
          await carregar();
        }}
      />
    </main>
  );
}
