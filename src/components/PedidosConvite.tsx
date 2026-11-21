import { useEffect, useState } from 'react';
import { useOnline } from '../hooks';
import { Icone } from './Icone';

interface Pedido {
  id: string;
  nome: string;
  email: string;
  mensagem?: string;
  criado_em: number;
}
interface Pronto {
  nome: string;
  email: string;
  link: string;
  tipo: 'conta' | 'senha';
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

Seus dados ficam só no seu celular e o app nunca acessa o seu banco.

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
      const r = (await (await fetch('/api/pedidos', { credentials: 'same-origin' })).json()) as { pedidos: Pedido[] };
      setPedidos(r.pedidos);
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
      const c = await postar<{ link?: string }>(`/api/pedidos/${p.id}`, { acao });
      if (acao === 'aprovar' && c.link) setProntos((a) => [...a, { nome: p.nome, email: p.email, link: c.link!, tipo: 'conta' }]);
      setPedidos((l) => l.filter((x) => x.id !== p.id));
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
    <section className="cartao">
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

      <h3 style={{ fontSize: 14, fontWeight: 800, marginTop: 8 }}>Pedidos feitos pelo site ({pedidos.length})</h3>
      {pedidos.length === 0 && <p className="pequeno suave">Nenhum pedido pendente.</p>}
      {pedidos.map((p) => (
        <div key={p.id} className="coluna" style={{ gap: 6, padding: 12, borderRadius: 18, background: 'var(--bg)' }}>
          <strong>{p.nome}</strong>
          <span className="pequeno">{p.email}</span>
          {p.mensagem && <span className="pequeno suave">“{p.mensagem}”</span>}
          <span className="mini suave">{new Date(p.criado_em).toLocaleString('pt-BR')}</span>
          <div className="grade-2">
            <button type="button" className="botao pequeno" onClick={() => decidir(p, 'aprovar')}><Icone nome="check" /> Aprovar</button>
            <button type="button" className="botao secundario pequeno" onClick={() => decidir(p, 'recusar')}>Recusar</button>
          </div>
        </div>
      ))}

      {prontos.map((p) => (
        <div key={p.link} className="coluna" style={{ gap: 8, padding: 12, borderRadius: 18, background: 'var(--bg)' }}>
          <strong className="pequeno">{p.tipo === 'conta' ? `Convite pronto para ${p.nome}` : `Link de senha nova para ${p.email}`}</strong>
          <a className="botao terracota pequeno" href={emailConvite(p.nome, p.email, p.link, p.tipo)}>Enviar por e-mail</a>
          <button type="button" className="botao secundario pequeno" onClick={() => navigator.clipboard.writeText(p.link).then(() => setMsg('Link copiado.'))}>Copiar o link</button>
        </div>
      ))}

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
  );
}
