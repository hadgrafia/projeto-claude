import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lerCache } from '../db';
import { useOnline } from '../hooks';
import { buscarPedidos, DOIS_DIAS, type Aceito } from '../lib/pedidos';
import { Icone } from './Icone';
import { AvatarPessoa } from './Atendimento';

interface Pedido {
  id: string;
  nome: string;
  email: string;
  mensagem?: string;
  criado_em: number;
  /** A pessoa já criou a senha no pedido: aprovar libera a conta na hora. */
  comSenha?: number;
}
interface Pronto {
  nome: string;
  email: string;
  link: string;
  tipo: 'conta' | 'senha' | 'liberado';
}

/** Aviso de acesso liberado (a pessoa já tem a senha): só entrar. */
function emailLiberado(nome: string, email: string, entrar: string) {
  const primeiro = nome.split(' ')[0] || nome;
  const corpo = `Oi, ${primeiro}!

Seu acesso ao Meus Planos Financeiros foi liberado. É só entrar com o seu e-mail (${email}) e a senha que você criou:
${entrar}

Para ter o app na tela inicial (grátis, sem loja e sem desligar nenhuma proteção do celular):
- Android (Chrome): no início do app, toque em "Instalar agora" (ou menu ⋮ > Instalar app).
- iPhone (Safari): Compartilhar > Adicionar à Tela de Início.

Até logo!`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Seu acesso ao Meus Planos Financeiros foi liberado')}&body=${encodeURIComponent(corpo)}`;
}

/** Texto do convite (ou do link de senha nova) para enviar pelo e-mail da própria administradora. */
export function emailConvite(nome: string, email: string, link: string, tipo: 'conta' | 'senha' = 'conta') {
  const primeiro = nome.split(' ')[0] || nome;
  const assunto = tipo === 'conta' ? 'Seu convite para o Meus Planos Financeiros' : 'Link para criar uma senha nova no Meus Planos';
  const corpo =
    tipo === 'conta'
      ? `Oi, ${primeiro}!

Seu acesso ao Meus Planos Financeiros foi liberado. É um app gratuito e privado para planejar seus sonhos (casa nova, carro, viagem), entender seus gastos e saber quanto guardar por mês.

Como entrar:
1. Abra este link pelo celular ou computador (ele é só seu, vale por 14 dias e funciona uma única vez):
${link}
2. Escolha uma senha para a sua conta.
3. Pronto: responda às perguntas iniciais do app. Das próximas vezes, é só entrar com o seu e-mail (${email}) e a senha.

Para ter o app na tela inicial (grátis, sem loja e sem desligar nenhuma proteção do celular):
- Android (Chrome): no início do app, toque em "Instalar agora" (ou menu ⋮ > Instalar app).
- iPhone (Safari): Compartilhar > Adicionar à Tela de Início.

Seus dados ficam guardados na sua conta (cifrados) e o app nunca acessa o seu banco.

Até logo!`
      : `Oi, ${primeiro}!

Aqui está o link para criar uma senha nova no Meus Planos Financeiros. Ele é só seu, vale por 24 horas e funciona uma única vez:
${link}

Se você não pediu, é só ignorar este e-mail: sua senha atual continua valendo.`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

async function postar<T>(url: string, corpo: unknown) {
  const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const c = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(c.erro ?? 'Não foi possível agora.');
  return c;
}

/** Só aparece para a administradora: convidar pessoas, aprovar pedidos e gerar links de senha nova. */
export function PedidosConvite() {
  const online = useOnline();
  const [admin, setAdmin] = useState(false);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [aceitos, setAceitos] = useState<Aceito[]>([]);
  const [prontos, setProntos] = useState<Pronto[]>([]);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [emailSenha, setEmailSenha] = useState('');
  const [msg, setMsg] = useState('');

  async function carregar() {
    try {
      const eu = (await (await fetch('/api/eu', { credentials: 'same-origin' })).json()) as { admin: boolean };
      setAdmin(eu.admin);
      if (!eu.admin) return;
      const r = await buscarPedidos();
      setPedidos(r.pedidos);
      setAceitos(r.aceitos);
    } catch {
      setAdmin(false);
    }
  }
  useEffect(() => {
    if (online) carregar();
  }, [online]);

  async function decidir(p: Pedido, acao: 'aprovar' | 'recusar') {
    setMsg('');
    try {
      const c = await postar<{ link?: string; contaCriada?: boolean; entrar?: string }>(`/api/pedidos/${p.id}`, { acao });
      if (acao === 'aprovar' && c.contaCriada && c.entrar) setProntos((a) => [...a, { nome: p.nome, email: p.email, link: c.entrar!, tipo: 'liberado' }]);
      else if (acao === 'aprovar' && c.link) setProntos((a) => [...a, { nome: p.nome, email: p.email, link: c.link!, tipo: 'conta' }]);
      if (acao === 'aprovar') setAceitos((a) => [{ nome: p.nome, email: p.email, temConta: Boolean(c.contaCriada) }, ...a.filter((x) => x.email !== p.email)]);
      setPedidos((l) => l.filter((x) => x.id !== p.id));
      buscarPedidos().catch(() => undefined);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function convidar(tipo: 'conta' | 'senha') {
    setMsg('');
    const alvo = (tipo === 'conta' ? email : emailSenha).trim().toLowerCase();
    try {
      const c = await postar<{ link?: string; jaTemConta?: boolean }>('/api/acesso/convidar', { email: alvo, tipo });
      if (c.jaTemConta) return setMsg('Este e-mail já tem conta. Se a pessoa esqueceu a senha, gere um link de senha nova abaixo.');
      setProntos((a) => [...a, { nome: tipo === 'conta' ? nome.trim() || alvo.split('@')[0] : alvo.split('@')[0], email: alvo, link: c.link!, tipo }]);
      setNome('');
      setEmail('');
      setEmailSenha('');
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  if (!admin) return null;
  return (
    <>
    <Link to="/atendimento" className="cartao cartao-link" style={{ flexDirection: 'row', alignItems: 'center' }}>
      <AvatarPessoa tamanho={40} destaque />
      <span className="cresce coluna" style={{ gap: 2 }}>
        <strong>Atendimento</strong>
        <span className="pequeno suave">Chamados das pessoas (só você vê). Para elas, quem responde é "a equipe".</span>
      </span>
      <Icone nome="direita" />
    </Link>
    <Link to="/estatisticas" className="cartao cartao-link" style={{ flexDirection: 'row', alignItems: 'center' }}>
      <span className="circulo terracota"><Icone nome="grafico" /></span>
      <span className="cresce coluna" style={{ gap: 2 }}>
        <strong>Estatísticas de uso</strong>
        <span className="pequeno suave">O que as pessoas mais usam e quais planos são prioridade (só contagens, sem identificar ninguém).</span>
      </span>
      <Icone nome="direita" />
    </Link>
    <section className="cartao" id="convites">
      <h2 style={{ fontSize: 15, fontWeight: 800 }}>Convites</h2>
      <p className="mini suave">Só você vê esta seção. Cada convite é um link pessoal: vale por 14 dias, funciona uma única vez e só cria conta para aquele e-mail.</p>

      <div className="coluna" style={{ gap: 10 }}>
        <label className="campo">
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" maxLength={80} placeholder="Ex.: Ana" />
        </label>
        <label className="campo">
          E-mail
          <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" placeholder="nome@exemplo.com" />
        </label>
        <button type="button" className="botao pequeno" disabled={!online || !email.includes('@')} onClick={() => convidar('conta')}>
          <Icone nome="mais" /> Criar convite
        </button>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 800, marginTop: 8 }}>Ainda não aceitos ({pedidos.length})</h3>
      {pedidos.length === 0 && <p className="pequeno suave">Nenhum pedido esperando.</p>}
      {pedidos.map((p) => (
        <div key={p.id} className="coluna" style={{ gap: 6, padding: 12, borderRadius: 18, background: 'var(--bg)' }}>
          <strong>{p.nome}</strong>
          <span className="pequeno">{p.email}</span>
          {p.mensagem && <span className="pequeno suave">“{p.mensagem}”</span>}
          <span className="mini" style={{ fontWeight: 600 }}>{p.comSenha ? 'Já criou a senha: aprovando, a conta é liberada na hora.' : 'Pedido antigo, sem senha: aprovando, gera um link de convite.'}</span>
          <span className="mini suave">
            Pediu em {new Date(p.criado_em).toLocaleString('pt-BR')}
            {Date.now() - p.criado_em > DOIS_DIAS ? <strong style={{ color: 'var(--terracota-texto)' }}> · esperando há mais de 2 dias</strong> : null}
          </span>
          <div className="grade-2">
            <button type="button" className="botao pequeno" onClick={() => decidir(p, 'aprovar')}><Icone nome="check" /> Aprovar</button>
            <button type="button" className="botao secundario pequeno" onClick={() => decidir(p, 'recusar')}>Recusar</button>
          </div>
        </div>
      ))}

      {prontos.map((p) => (
        <div key={p.link} className="coluna" style={{ gap: 8, padding: 12, borderRadius: 18, background: 'var(--bg)' }}>
          <strong className="pequeno">
            {p.tipo === 'liberado' ? `${p.nome} já pode entrar (com a senha que criou no pedido)` : p.tipo === 'conta' ? `Convite pronto para ${p.nome}` : `Link de senha nova para ${p.email}`}
          </strong>
          <a className="botao terracota pequeno" href={p.tipo === 'liberado' ? emailLiberado(p.nome, p.email, p.link) : emailConvite(p.nome, p.email, p.link, p.tipo)}>
            {p.tipo === 'liberado' ? 'Avisar por e-mail (opcional)' : 'Enviar por e-mail'}
          </a>
          <button type="button" className="botao secundario pequeno" onClick={() => navigator.clipboard.writeText(p.link).then(() => setMsg('Link copiado.'))}>Copiar o link</button>
        </div>
      ))}

      <h3 style={{ fontSize: 14, fontWeight: 800, marginTop: 8 }}>Já aceitos ({aceitos.length})</h3>
      {aceitos.length === 0 && <p className="pequeno suave">Ninguém aceito pelos pedidos do site ainda.</p>}
      {aceitos.length > 0 && (
        <div className="lista">
          {aceitos.map((a) => (
            <div key={a.email} className="item" style={{ cursor: 'default' }}>
              <span className="cresce coluna" style={{ gap: 2, minWidth: 0 }}>
                <strong>{a.nome}</strong>
                <span className="pequeno suave" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.email}</span>
              </span>
              <span className={`pilula ${a.temConta ? 'manter' : 'rever'}`}>{a.temConta ? 'Criou a conta' : 'Ainda não entrou'}</span>
            </div>
          ))}
        </div>
      )}

      <details>
        <summary className="pequeno" style={{ cursor: 'pointer', fontWeight: 700 }}>Alguém esqueceu a senha?</summary>
        <div className="coluna" style={{ gap: 10, marginTop: 10 }}>
          <label className="campo">
            E-mail da conta
            <input type="email" inputMode="email" value={emailSenha} onChange={(e) => setEmailSenha(e.target.value)} autoComplete="off" placeholder="nome@exemplo.com" />
          </label>
          <button type="button" className="botao secundario pequeno" disabled={!online || !emailSenha.includes('@')} onClick={() => convidar('senha')}>Gerar link de senha nova</button>
        </div>
      </details>
      {msg && <p className="pequeno" role="status">{msg}</p>}
    </section>
    </>
  );
}

/** Início: chamados de atendimento (equipe) ou resposta nova para quem perguntou. */
export function AvisoAtendimento() {
  const [abertos, setAbertos] = useState<{ id: string; nome: string; naoLidas: number }[]>([]);
  const [resposta, setResposta] = useState(0);
  useEffect(() => {
    const ler = () => {
      lerCache<{ id: string; nome: string; naoLidas: number }[]>('chamados-abertos').then((c) => setAbertos(c?.valor ?? []));
      lerCache<number>('resposta-atendimento').then((c) => setResposta(c?.valor ?? 0));
    };
    ler();
    window.addEventListener('mp-chamados', ler);
    return () => window.removeEventListener('mp-chamados', ler);
  }, []);
  const estilo = { gridColumn: '1 / -1', flexDirection: 'row' as const, alignItems: 'center' };
  if (resposta > 0)
    return (
      <Link to="/ajuda?pessoa=1" className="cartao cartao-link verde" style={estilo}>
        <AvatarPessoa tamanho={40} destaque />
        <span className="cresce coluna" style={{ gap: 2 }}>
          <strong>Resposta do atendimento</strong>
          <span className="pequeno">Uma pessoa da equipe respondeu a sua dúvida.</span>
        </span>
        <Icone nome="direita" />
      </Link>
    );
  const comNovas = abertos.filter((c) => c.naoLidas > 0);
  if (!comNovas.length) return null;
  return (
    <Link to="/atendimento" className="cartao cartao-link terracota" style={estilo}>
      <AvatarPessoa tamanho={40} />
      <span className="cresce coluna" style={{ gap: 2 }}>
        <strong>{comNovas.length === 1 ? 'Chamado de atendimento' : `${comNovas.length} chamados de atendimento`}</strong>
        <span className="pequeno">{comNovas.map((c) => c.nome).slice(0, 3).join(', ')}{comNovas.length > 3 ? ' e outros' : ''} esperando resposta</span>
      </span>
      <Icone nome="direita" />
    </Link>
  );
}

/** Início (só para a administradora): pedidos de convite esperando resposta. */
export function AvisoPedidos() {
  const [lista, setLista] = useState<{ id: string; nome: string; criado_em: number }[]>([]);
  useEffect(() => {
    const ler = () => lerCache<{ id: string; nome: string; criado_em: number }[]>('pedidos-pendentes').then((c) => setLista(c?.valor ?? []));
    ler();
    window.addEventListener('mp-pedidos', ler);
    return () => window.removeEventListener('mp-pedidos', ler);
  }, []);
  if (!lista.length) return null;
  const antigos = lista.filter((p) => Date.now() - p.criado_em > DOIS_DIAS).length;
  return (
    <Link
      to="/ajustes"
      onClick={() => setTimeout(() => document.getElementById('convites')?.scrollIntoView({ behavior: 'smooth' }), 500)}
      className={`cartao cartao-link ${antigos ? 'terracota' : 'verde'}`}
      style={{ gridColumn: '1 / -1', flexDirection: 'row', alignItems: 'center' }}
    >
      <span className="circulo" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}><Icone nome="sino" /></span>
      <span className="cresce coluna" style={{ gap: 2 }}>
        <strong>{antigos ? 'Tem convites para serem aceitos' : lista.length === 1 ? 'Novo pedido de convite' : `${lista.length} pedidos de convite`}</strong>
        <span className="pequeno">
          {lista.length === 1 ? `${lista[0].nome} está esperando` : `${lista.map((p) => p.nome).slice(0, 3).join(', ')}${lista.length > 3 ? ' e outros' : ''} estão esperando`}
          {antigos ? ` · ${antigos === 1 ? '1 há' : `${antigos} há`} mais de 2 dias` : ''}
        </span>
      </span>
      <Icone nome="direita" />
    </Link>
  );
}
