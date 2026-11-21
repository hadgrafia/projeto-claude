import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { db, type Plano } from '../db';
import { useDados, useOnline } from '../hooks';
import { criarConjunto, entrarDeNovo, gerarConvite, liberarEmail, sairDoConjunto, SessaoExpirada, sincronizarConjunto } from '../lib/conjunto';
import { reaisCurto } from '../lib/format';
import { Icone } from './Icone';
import { Entra, Folha } from './Ui';

/** Seção do plano em conjunto dentro da tela do plano. */
export function SecaoConjunto({ plano }: { plano: Plano }) {
  const { perfil, movimentos, investimentos } = useDados();
  const online = useOnline();
  const [erro, setErro] = useState<{ msg: string; sessao?: boolean }>();
  const [convidando, setConvidando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const c = plano.conjunto;
  const dados = { perfil, movimentos, investimentos };

  const tratar = (e: unknown) => setErro({ msg: (e as Error).message, sessao: e instanceof SessaoExpirada });

  // Atualiza ao abrir e a cada minuto enquanto a tela estiver aberta.
  useEffect(() => {
    if (!c || !online || !perfil) return; // espera os dados da pessoa carregarem
    const rodar = () => sincronizarConjunto(plano, dados).then(() => setErro(undefined)).catch(tratar);
    rodar();
    const t = setInterval(rodar, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id, online, perfil, plano.percentual, plano.guardado, investimentos, movimentos.length]);

  if (!c) {
    return (
      <section className="cartao">
        <div className="linha">
          <span className="circulo verde"><Icone nome="casa" /></span>
          <div className="coluna cresce" style={{ gap: 2 }}>
            <strong>Fazer em conjunto</strong>
            <span className="pequeno suave">Convide um familiar para juntar dinheiro para este mesmo plano. Cada um vê os próprios gastos; o grupo vê só o resumo de cada um.</span>
          </div>
        </div>
        <button
          type="button"
          className="botao secundario pequeno"
          disabled={!online || ocupado}
          onClick={async () => {
            setOcupado(true);
            try {
              await criarConjunto(plano, dados);
              setConvidando(true);
            } catch (e) {
              tratar(e);
            } finally {
              setOcupado(false);
            }
          }}
        >
          {online ? 'Convidar familiar' : 'Precisa de internet'}
        </button>
        <Erro erro={erro} />
      </section>
    );
  }

  const membros = [...c.membros].sort((a, b) => (a.membroId === c.membroId ? -1 : b.membroId === c.membroId ? 1 : 0));
  return (
    <section className="cartao verde">
      <div className="entre">
        <strong style={{ fontSize: 16 }}>Plano em conjunto</strong>
        <span className="mini suave">{c.sincronizadoEm ? `Atualizado ${new Date(c.sincronizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
      </div>
      {membros.map((m, i) => (
        <Entra key={m.membroId} i={i}>
          <div className="coluna" style={{ gap: 4, padding: '10px 12px', borderRadius: 18, background: 'var(--verde-2)' }}>
            <div className="entre">
              <strong>{m.apelido}{m.membroId === c.membroId ? ' (você)' : ''}</strong>
              <span className="num">{reaisCurto(m.guardado)} guardados</span>
            </div>
            <span className="mini suave">
              Separa {reaisCurto(m.aporteMensal)}/mês · sobra {reaisCurto(m.livreMensal)}/mês{m.rendaMedia ? ` · renda média ${reaisCurto(m.rendaMedia)}` : ''}
            </span>
            {m.sugestoes.length > 0 && (
              <span className="mini">
                Pode liberar +{reaisCurto(m.sugestoes.reduce((a, s) => a + s.ganho, 0))}/mês: {m.sugestoes.map((s) => `${s.categoria} (${s.status})`).join(', ')}
              </span>
            )}
          </div>
        </Entra>
      ))}
      {plano.percentual === 0 && (
        <div className="cartao areia pequeno" style={{ color: 'var(--texto)' }}>
          Você ainda não separa nada para este plano. Defina a sua porcentagem em Editar plano (lápis no topo).
        </div>
      )}
      <label className="linha pequeno" style={{ gap: 10 }}>
        <input
          type="checkbox"
          checked={c.mostrarRenda}
          onChange={(e) => db.planos.update(plano.id!, { conjunto: { ...c, mostrarRenda: e.target.checked } })}
          style={{ width: 20, height: 20, accentColor: '#D9774F' }}
        />
        Mostrar minha renda média para o grupo
      </label>
      <div className="grade-2">
        <button type="button" className="botao terracota pequeno" disabled={!online} onClick={() => setConvidando(true)}>
          <Icone nome="mais" /> Convidar
        </button>
        <button
          type="button"
          className="botao secundario pequeno"
          disabled={!online}
          onClick={async () => {
            if (!confirm('Sair do plano em conjunto? Você fica com uma cópia só sua.')) return;
            try {
              await sairDoConjunto(plano);
            } catch (e) {
              tratar(e);
            }
          }}
        >
          Sair do grupo
        </button>
      </div>
      <span className="mini suave">Os dados do grupo são cifrados no seu celular: nem o servidor consegue ler.</span>
      <Erro erro={erro} />
      <Folha aberta={convidando} aoFechar={() => setConvidando(false)} titulo="Convidar familiar">
        <Convidar plano={plano} />
      </Folha>
    </section>
  );
}

function Erro({ erro }: { erro?: { msg: string; sessao?: boolean } }) {
  if (!erro) return null;
  return (
    <div className="cartao areia pequeno" style={{ color: 'var(--texto)' }}>
      {erro.msg}
      {erro.sessao && <button type="button" className="botao pequeno" onClick={entrarDeNovo}>Entrar de novo</button>}
    </div>
  );
}

function Convidar({ plano }: { plano: Plano }) {
  const [email, setEmail] = useState('');
  const [link, setLink] = useState('');
  const [estado, setEstado] = useState('');
  const [erro, setErro] = useState<{ msg: string; sessao?: boolean }>();

  async function gerar() {
    setErro(undefined);
    try {
      if (email.trim()) {
        setEstado('Liberando o e-mail…');
        try {
          await liberarEmail(email.trim());
        } catch (e) {
          if (e instanceof SessaoExpirada) throw e;
          setEstado(`Não foi possível liberar o e-mail automaticamente (${(e as Error).message}). Peça para a administradora liberar.`);
        }
      }
      const l = await gerarConvite(plano.conjunto!);
      setLink(l);
      setEstado((s) => (s.startsWith('Não') ? s : ''));
    } catch (e) {
      setErro({ msg: (e as Error).message, sessao: e instanceof SessaoExpirada });
      setEstado('');
    }
  }

  async function compartilhar() {
    const texto = `Vamos juntar dinheiro para "${plano.nome}" no Meus Planos? Abra este link pelo celular (vale por 48 horas e só pode ser usado uma vez):`;
    if (navigator.share) await navigator.share({ title: 'Meus Planos', text: texto, url: link }).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(`${texto} ${link}`);
      setEstado('Link copiado. Envie pelo WhatsApp ou e-mail.');
    }
  }

  return (
    <>
      {!link ? (
        <>
          <p className="pequeno suave">Só e-mails convidados conseguem abrir o app. Informe o e-mail do familiar para liberá-lo e gerar o convite.</p>
          <label className="campo">
            E-mail do familiar
            <input type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@exemplo.com" />
          </label>
          <motion.button type="button" whileTap={{ scale: 0.97 }} className="botao" onClick={gerar}>Gerar convite</motion.button>
        </>
      ) : (
        <>
          <div className="cartao manter">
            <strong>Convite pronto</strong>
            <span className="pequeno">Vale por 48 horas e funciona uma única vez. Quem receber precisa entrar com o e-mail liberado.</span>
          </div>
          <button type="button" className="botao terracota" onClick={compartilhar}><Icone nome="link" /> Enviar convite</button>
        </>
      )}
      {estado && <p className="pequeno suave" role="status">{estado}</p>}
      <Erro erro={erro} />
    </>
  );
}
