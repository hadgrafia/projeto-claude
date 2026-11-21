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

const ENDERECO = 'https://meus-planos-financeiros.pages.dev';

/** Texto do convite para enviar pelo e-mail da própria administradora (sem custo, sem domínio). */
export function linkConvite(nome: string, email: string) {
  const assunto = 'Seu convite para o Meus Planos Financeiros';
  const corpo = `Oi, ${nome.split(' ')[0]}!

Seu acesso ao Meus Planos Financeiros foi liberado. É um app gratuito e privado para planejar seus sonhos (casa nova, carro, viagem), entender seus gastos e saber quanto guardar por mês.

Como entrar:
1. Abra ${ENDERECO}/app pelo celular ou computador.
2. Digite este e-mail (${email}) e o código de 6 números que chegar na sua caixa de entrada.
3. Siga as perguntas iniciais e crie sua senha.

Para ter o ícone na tela inicial:
- Android (Chrome): menu ⋮ > Instalar app.
- iPhone (Safari): Compartilhar > Adicionar à Tela de Início.

Seus dados ficam só no seu celular e o app nunca acessa o seu banco.

Até logo!`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

/** Só aparece para a administradora: pedidos feitos pela página de apresentação. */
export function PedidosConvite() {
  const online = useOnline();
  const [admin, setAdmin] = useState(false);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [automatico, setAutomatico] = useState(false);
  const [aprovados, setAprovados] = useState<Pedido[]>([]);
  const [msg, setMsg] = useState('');

  async function carregar() {
    try {
      const eu = (await (await fetch('/api/eu', { credentials: 'same-origin' })).json()) as { admin: boolean };
      setAdmin(eu.admin);
      if (!eu.admin) return;
      const r = (await (await fetch('/api/pedidos', { credentials: 'same-origin' })).json()) as { pedidos: Pedido[]; convitesAutomaticos: boolean };
      setPedidos(r.pedidos);
      setAutomatico(r.convitesAutomaticos);
    } catch {
      setAdmin(false);
    }
  }
  useEffect(() => {
    if (online) carregar();
  }, [online]);

  async function decidir(p: Pedido, acao: 'aprovar' | 'recusar') {
    setMsg('');
    const r = await fetch(`/api/pedidos/${p.id}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao }) });
    const c = (await r.json().catch(() => ({}))) as { erro?: string };
    if (!r.ok) return setMsg(c.erro ?? 'Não foi possível agora.');
    if (acao === 'aprovar') setAprovados((a) => [...a, p]);
    setPedidos((l) => l.filter((x) => x.id !== p.id));
  }

  if (!admin) return null;
  return (
    <section className="cartao">
      <h2 style={{ fontSize: 15, fontWeight: 800 }}>Pedidos de convite ({pedidos.length})</h2>
      <p className="mini suave">Pedidos feitos pela página de apresentação. Só você vê esta seção.</p>
      {!automatico && <p className="cartao areia pequeno">Para aprovar por aqui, falta o segredo CLOUDFLARE_ACCESS_TOKEN no GitHub. Até lá, mande os e-mails ao Claude para liberar.</p>}
      {pedidos.length === 0 && <p className="pequeno suave">Nenhum pedido pendente.</p>}
      {pedidos.map((p) => (
        <div key={p.id} className="coluna" style={{ gap: 6, padding: 12, borderRadius: 18, background: 'var(--bg)' }}>
          <strong>{p.nome}</strong>
          <span className="pequeno">{p.email}</span>
          {p.mensagem && <span className="pequeno suave">“{p.mensagem}”</span>}
          <span className="mini suave">{new Date(p.criado_em).toLocaleString('pt-BR')}</span>
          <div className="grade-2">
            <button type="button" className="botao pequeno" disabled={!automatico} onClick={() => decidir(p, 'aprovar')}><Icone nome="check" /> Aprovar</button>
            <button type="button" className="botao secundario pequeno" onClick={() => decidir(p, 'recusar')}>Recusar</button>
          </div>
        </div>
      ))}
      {aprovados.map((p) => (
        <a key={p.id} className="botao terracota pequeno" href={linkConvite(p.nome, p.email)}>
          Enviar convite por e-mail para {p.nome.split(' ')[0]}
        </a>
      ))}
      {msg && <p className="pequeno" role="status">{msg}</p>}
    </section>
  );
}
