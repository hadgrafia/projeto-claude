import { useEffect, useRef, useState } from 'react';
import type { MensagemChamado } from '../lib/atendimento';
import { Icone } from './Icone';

/** Avatar do atendimento humano: sem foto, só o símbolo de uma pessoa. */
export function AvatarPessoa({ tamanho = 36, destaque = false }: { tamanho?: number; destaque?: boolean }) {
  return (
    <span
      className="avatar-agente"
      aria-hidden="true"
      style={{ width: tamanho, height: tamanho, background: destaque ? 'var(--terracota)' : '#3B4A3A', color: '#F0EBE1', display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}
    >
      <Icone nome="pessoa" tamanho={Math.round(tamanho * 0.55)} />
    </span>
  );
}

const hora = (ms: number) => {
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/** Lista de mensagens de um chamado. `eu` é quem está vendo (a pessoa ou a equipe). */
export function ConversaChamado({ mensagens, eu, nomeOutro }: { mensagens: MensagemChamado[]; eu: 'pessoa' | 'equipe'; nomeOutro: string }) {
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Alguns navegadores novos devolvem uma promessa aqui: o efeito não pode devolver nada.
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens.length]);
  return (
    <div className="mensagens" aria-live="polite">
      {mensagens.map((m) =>
        m.de === eu ? (
          <div key={m.id} className="balao pessoa">
            <span style={{ whiteSpace: 'pre-wrap' }}>{m.texto}</span>
            <span className="mini" style={{ opacity: 0.75, alignSelf: 'flex-end' }}>{hora(m.em)}</span>
          </div>
        ) : (
          <div key={m.id} className="linha" style={{ alignItems: 'flex-start' }}>
            <AvatarPessoa tamanho={32} />
            <div className="balao agente">
              <strong className="mini">{nomeOutro}</strong>
              <span style={{ whiteSpace: 'pre-wrap' }}>{m.texto}</span>
              <span className="mini suave">{hora(m.em)}</span>
            </div>
          </div>
        ),
      )}
      <div ref={fim} />
    </div>
  );
}

/** Caixa de texto para mandar mensagem. */
export function EscreverMensagem({ aoEnviar, dica }: { aoEnviar: (t: string) => Promise<void>; dica: string }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  async function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setErro('');
    try {
      await aoEnviar(t);
      setTexto('');
    } catch (e) {
      setErro(navigator.onLine ? (e as Error).message : 'Sem internet. Conecte-se para enviar.');
    } finally {
      setEnviando(false);
    }
  }
  return (
    <>
      {erro && <p className="cartao areia pequeno" role="alert">{erro}</p>}
      <form className="barra-chat" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={dica} rows={1} maxLength={1500} aria-label={dica} />
        <button type="submit" className="circulo terracota" aria-label="Enviar" disabled={!texto.trim() || enviando}>
          <Icone nome="seta" />
        </button>
      </form>
    </>
  );
}
