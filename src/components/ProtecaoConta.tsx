import qrcode from 'qrcode-generator';
import { useEffect, useState } from 'react';
import { lerCache, salvarCache } from '../db';
import { Icone } from './Icone';
import { BotaoSalvar } from './Ui';

/**
 * Proteção da conta (Ajustes):
 *  - verificação em duas etapas com app autenticador (senha + código de 6 dígitos);
 *  - aparelhos conectados, com "desconectar" e "sair de todos os outros".
 */

async function chamar<T>(url: string, corpo?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: corpo === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const c = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(c.erro ?? 'Não foi possível agora. Tente de novo em instantes.');
  return c;
}

export interface Aparelho {
  id: string;
  aparelho: string;
  pais?: string;
  entrouEm: number;
  ultimoUso: number;
  atual: boolean;
}

const quando = (ms: number) => {
  const d = new Date(ms);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia ? `hoje às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: d.getFullYear() === hoje.getFullYear() ? undefined : 'numeric' });
};
const PAISES: Record<string, string> = { BR: 'Brasil', PT: 'Portugal', US: 'Estados Unidos' };
const lugar = (p?: string) => (p ? ` · ${PAISES[p] ?? p}` : '');

function QR({ texto }: { texto: string }) {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
  return <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="QR code para o app autenticador" style={{ width: 200, height: 200, background: '#fff', borderRadius: 12, alignSelf: 'center' }} />;
}

function CodigosRecuperacao({ codigos, aoFechar }: { codigos: string[]; aoFechar: () => void }) {
  const texto = `Meus Planos Financeiros — códigos de recuperação\nCada código funciona uma vez, no lugar do código do app autenticador.\n\n${codigos.join('\n')}\n`;
  return (
    <div className="coluna" style={{ gap: 10 }}>
      <strong>Guarde estes códigos de recuperação</strong>
      <p className="pequeno">Se perder o celular, cada código abre a conta uma vez no lugar do código do app. Guarde fora do celular (papel ou gerenciador de senhas). Eles não aparecem de novo.</p>
      <div className="cartao areia" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 14 }}>
        {codigos.map((c) => <span key={c}>{c}</span>)}
      </div>
      <div className="grade-2">
        <button type="button" className="botao secundario pequeno" onClick={() => navigator.clipboard?.writeText(texto)}>Copiar</button>
        <button
          type="button"
          className="botao secundario pequeno"
          onClick={() => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }));
            a.download = 'meus-planos-codigos-de-recuperacao.txt';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          }}
        >
          Baixar
        </button>
      </div>
      <button type="button" className="botao pequeno" onClick={aoFechar}>Já guardei</button>
    </div>
  );
}

export function DuasEtapas() {
  const [estado, setEstado] = useState<{ ativo: boolean; codigosRestantes: number }>();
  const [etapa, setEtapa] = useState<'' | 'senha' | 'qr' | 'codigos' | 'desligar' | 'novos'>('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [config, setConfig] = useState<{ segredo: string; link: string }>();
  const [codigos, setCodigos] = useState<string[]>([]);
  const [erro, setErro] = useState('');

  const carregar = () =>
    chamar<{ ativo: boolean; codigosRestantes: number }>('/api/conta/duas-etapas')
      .then(setEstado)
      .catch((e: Error) => setErro(navigator.onLine ? e.message : 'Conecte-se à internet para ver a proteção da conta.'));
  useEffect(() => {
    carregar();
  }, []);

  const limpar = () => {
    setSenha('');
    setCodigo('');
    setErro('');
  };
  async function tentar<T>(f: () => Promise<T>) {
    setErro('');
    try {
      return await f();
    } catch (e) {
      setErro((e as Error).message);
      return false as const;
    }
  }

  return (
    <section className="cartao" id="duas-etapas">
      <div className="entre">
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>Verificação em duas etapas</h2>
        {estado && <span className={`pilula ${estado.ativo ? 'manter' : 'terracota'}`}>{estado.ativo ? 'Ligada' : 'Desligada'}</span>}
      </div>
      <p className="mini suave">
        Além da senha, a conta pede um código de 6 dígitos que muda a cada 30 segundos num app autenticador do seu celular (Google Authenticator, Microsoft Authenticator, Authy ou 2FAS, todos gratuitos). Mesmo que alguém descubra a sua senha, não entra sem o seu celular.
      </p>

      {estado && !estado.ativo && etapa === '' && (
        <button type="button" className="botao pequeno" onClick={() => { limpar(); setEtapa('senha'); }}>
          <Icone nome="escudo" /> Ligar verificação em duas etapas
        </button>
      )}

      {etapa === 'senha' && (
        <>
          <label className="campo">Confirme a sua senha<input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
          <BotaoSalvar
            className="botao pequeno"
            disabled={!senha}
            salvo="Confirmado"
            aoSalvar={() => tentar(async () => setConfig(await chamar('/api/conta/duas-etapas', { acao: 'iniciar', senha })))}
            depois={() => setEtapa('qr')}
          >
            Continuar
          </BotaoSalvar>
          <button type="button" className="botao secundario pequeno" onClick={() => setEtapa('')}>Cancelar</button>
        </>
      )}

      {etapa === 'qr' && config && (
        <>
          <ol className="pequeno" style={{ paddingLeft: 18, display: 'grid', gap: 6 }}>
            <li>Instale um app autenticador gratuito (ex.: Google Authenticator) pela loja do celular.</li>
            <li>No app, toque em adicionar e leia o QR code abaixo. No próprio celular, toque em "Abrir no app autenticador" ou copie a chave.</li>
            <li>Digite o código de 6 dígitos que aparecer.</li>
          </ol>
          <QR texto={config.link} />
          <a className="botao secundario pequeno" href={config.link}>Abrir no app autenticador</a>
          <div className="cartao areia" style={{ padding: 12, gap: 4 }}>
            <span className="mini suave">Chave para digitar no app</span>
            <code style={{ fontSize: 15, wordBreak: 'break-all', letterSpacing: 1 }}>{config.segredo.replace(/(.{4})/g, '$1 ').trim()}</code>
          </div>
          <label className="campo">Código de 6 dígitos<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} placeholder="000000" /></label>
          <BotaoSalvar
            className="botao pequeno"
            disabled={codigo.length !== 6}
            salvo="Ligada"
            aoSalvar={() =>
              tentar(async () => {
                const r = await chamar<{ codigosRecuperacao: string[] }>('/api/conta/duas-etapas', { acao: 'ativar', codigo });
                setCodigos(r.codigosRecuperacao);
              })
            }
            depois={() => { setEtapa('codigos'); carregar(); }}
          >
            Confirmar e ligar
          </BotaoSalvar>
        </>
      )}

      {etapa === 'codigos' && <CodigosRecuperacao codigos={codigos} aoFechar={() => { setCodigos([]); setEtapa(''); limpar(); }} />}

      {estado?.ativo && etapa === '' && (
        <>
          <span className="pequeno">Códigos de recuperação sobrando: <strong>{estado.codigosRestantes}</strong>{estado.codigosRestantes <= 2 ? ' (gere novos)' : ''}</span>
          <div className="grade-2">
            <button type="button" className="botao secundario pequeno" onClick={() => { limpar(); setEtapa('novos'); }}>Novos códigos de recuperação</button>
            <button type="button" className="botao perigo pequeno" onClick={() => { limpar(); setEtapa('desligar'); }}>Desligar</button>
          </div>
        </>
      )}

      {(etapa === 'desligar' || etapa === 'novos') && (
        <>
          {etapa === 'desligar' && <p className="pequeno" style={{ color: 'var(--terracota-texto)' }}>Sem a verificação em duas etapas, só a senha protege a sua conta.</p>}
          <label className="campo">Sua senha<input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
          <label className="campo">Código do app autenticador<input inputMode="numeric" autoComplete="one-time-code" maxLength={9} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="000000" /></label>
          <BotaoSalvar
            className={etapa === 'desligar' ? 'botao perigo pequeno' : 'botao pequeno'}
            disabled={!senha || !codigo}
            salvo={etapa === 'desligar' ? 'Desligada' : 'Códigos novos'}
            aoSalvar={() =>
              tentar(async () => {
                const r = await chamar<{ codigosRecuperacao?: string[] }>('/api/conta/duas-etapas', { acao: etapa === 'desligar' ? 'desativar' : 'novos-codigos', senha, codigo });
                if (r.codigosRecuperacao) setCodigos(r.codigosRecuperacao);
              })
            }
            depois={() => { setEtapa(etapa === 'novos' ? 'codigos' : ''); carregar(); }}
          >
            {etapa === 'desligar' ? 'Desligar verificação' : 'Gerar códigos novos'}
          </BotaoSalvar>
          <button type="button" className="botao secundario pequeno" onClick={() => { limpar(); setEtapa(''); }}>Cancelar</button>
        </>
      )}
      {erro && <p className="pequeno" role="alert" style={{ color: 'var(--terracota-texto)' }}>{erro}</p>}
    </section>
  );
}

export function Aparelhos() {
  const [lista, setLista] = useState<Aparelho[]>();
  const [erro, setErro] = useState('');
  const carregar = () =>
    chamar<{ aparelhos: Aparelho[] }>('/api/conta/aparelhos')
      .then((r) => {
        setLista(r.aparelhos);
        salvarCache('aparelhos-vistos', r.aparelhos.map((a) => a.id)).catch(() => undefined);
      })
      .catch((e: Error) => setErro(navigator.onLine ? e.message : 'Conecte-se à internet para ver os aparelhos conectados.'));
  useEffect(() => {
    carregar();
  }, []);
  const outros = (lista ?? []).filter((a) => !a.atual);
  return (
    <section className="cartao" id="aparelhos">
      <h2 style={{ fontSize: 15, fontWeight: 800 }}>Aparelhos conectados</h2>
      <p className="mini suave">Onde a sua conta está aberta agora. Não reconhece algum? Desconecte e troque a senha.</p>
      {lista && (
        <div className="lista">
          {lista.map((a) => (
            <div key={a.id} className="item" style={{ cursor: 'default' }}>
              <span className={`circulo ${a.atual ? 'manter' : 'rever'}`}><Icone nome={/App|Android|iPhone|iPad/.test(a.aparelho) ? 'tela' : 'notebook'} /></span>
              <span className="cresce coluna" style={{ gap: 2 }}>
                <strong>{a.aparelho}{a.atual ? ' (este aparelho)' : ''}</strong>
                <span className="mini suave">Entrou {quando(a.entrouEm)} · usado {quando(a.ultimoUso)}{lugar(a.pais)}</span>
              </span>
              {!a.atual && (
                <BotaoSalvar className="botao perigo pequeno" style={{ width: 'auto', padding: '8px 12px' }} salvo="Saiu" aoSalvar={() => chamar('/api/conta/aparelhos', { id: a.id })} depois={carregar}>
                  Desconectar
                </BotaoSalvar>
              )}
            </div>
          ))}
        </div>
      )}
      {outros.length > 1 && (
        <BotaoSalvar className="botao perigo pequeno" salvo="Desconectados" aoSalvar={() => chamar('/api/conta/aparelhos', { todos: true })} depois={carregar}>
          Sair de todos os outros aparelhos
        </BotaoSalvar>
      )}
      {erro && <p className="pequeno" role="alert">{erro}</p>}
    </section>
  );
}

/**
 * Início: avisa quando a conta foi aberta num aparelho novo desde a última vez
 * (para a pessoa perceber logo se não foi ela).
 */
export function AvisoNovoAcesso() {
  const [novos, setNovos] = useState<Aparelho[]>([]);
  useEffect(() => {
    if (!navigator.onLine) return;
    (async () => {
      const r = await chamar<{ aparelhos: Aparelho[] }>('/api/conta/aparelhos');
      const vistos = (await lerCache<string[]>('aparelhos-vistos'))?.valor;
      const ids = r.aparelhos.map((a) => a.id);
      // Primeira vez neste aparelho: só anota (não há com o que comparar).
      if (!vistos) return salvarCache('aparelhos-vistos', ids);
      setNovos(r.aparelhos.filter((a) => !a.atual && !vistos.includes(a.id)));
    })().catch(() => undefined);
  }, []);
  if (!novos.length) return null;
  const marcarVisto = async () => {
    const vistos = (await lerCache<string[]>('aparelhos-vistos'))?.valor ?? [];
    await salvarCache('aparelhos-vistos', [...vistos, ...novos.map((a) => a.id)]);
    setNovos([]);
  };
  return (
    <section className="cartao alerta-vermelho" role="alert" style={{ gridColumn: '1 / -1', gap: 8 }}>
      <strong>Novo acesso à sua conta</strong>
      {novos.map((a) => (
        <span key={a.id} className="pequeno">{a.aparelho}{lugar(a.pais)} · {quando(a.entrouEm)}</span>
      ))}
      <span className="pequeno">Foi você? Se não foi, desconecte o aparelho e troque a sua senha agora.</span>
      <div className="grade-2">
        <button type="button" className="botao pequeno" style={{ background: '#fff', color: '#B3261E' }} onClick={marcarVisto}>Fui eu</button>
        <a className="botao pequeno" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', textAlign: 'center' }} href="#/ajustes" onClick={() => setTimeout(() => document.getElementById('aparelhos')?.scrollIntoView({ behavior: 'smooth' }), 500)}>
          Não fui eu
        </a>
      </div>
    </section>
  );
}
