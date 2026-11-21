import { useState } from 'react';
import { db, type Perfil } from '../db';
import { pedirPermissaoAvisos } from '../lib/avisos';
import { CampoDinheiro } from './Ui';

/** Cartão de crédito e valor a partir do qual o app pergunta sobre a compra. */
export function AjustesCartao({ perfil, aoSalvar }: { perfil: Perfil; aoSalvar: (msg: string) => void }) {
  const [limite, setLimite] = useState<number | undefined>(perfil.limiteCartao);
  const [usado, setUsado] = useState<number | undefined>(perfil.limiteUsado);
  const [aviso, setAviso] = useState<number | undefined>(perfil.limiteAvisoCompra ?? 100);
  return (
    <section className="cartao">
      <h2 style={{ fontSize: 15, fontWeight: 800 }}>Cartão e compras</h2>
      <CampoDinheiro rotulo="Limite total do cartão de crédito" valor={limite} aoMudar={setLimite} dica="Tem mais de um cartão? Some os limites." />
      <CampoDinheiro rotulo="Quanto do limite já está usado hoje" valor={usado} aoMudar={setUsado} dica="Veja no app do seu banco (fatura atual + parcelas futuras). Atualize de vez em quando." />
      <CampoDinheiro rotulo="Perguntar sobre compras a partir de" valor={aviso} aoMudar={setAviso} dica="O app pede a finalidade e o parcelamento das compras acima deste valor." />
      {perfil.limiteUsadoEm && <span className="mini suave">Uso do limite informado em {new Date(perfil.limiteUsadoEm).toLocaleDateString('pt-BR')}.</span>}
      <button
        type="button"
        className="botao pequeno"
        onClick={async () => {
          await db.perfil.update('eu', {
            limiteCartao: limite,
            limiteUsado: usado,
            limiteUsadoEm: usado !== perfil.limiteUsado || !perfil.limiteUsadoEm ? new Date().toISOString() : perfil.limiteUsadoEm,
            limiteAvisoCompra: aviso && aviso > 0 ? aviso : 100,
          });
          aoSalvar('Cartão e compras salvos.');
        }}
      >
        Salvar
      </button>
    </section>
  );
}

/** E-mail, celular e por onde receber os avisos do app. */
export function AjustesContato({ perfil, aoSalvar }: { perfil: Perfil; aoSalvar: (msg: string) => void }) {
  const [email, setEmail] = useState(perfil.email ?? '');
  const [celular, setCelular] = useState(perfil.celular ?? '');
  const [noCelular, setNoCelular] = useState(perfil.avisos?.celular ?? false);
  const [porEmail, setPorEmail] = useState(perfil.avisos?.email ?? false);
  const [agentes, setAgentes] = useState(perfil.avisos?.agentes !== false);
  const emailOk = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const celularLimpo = celular.replace(/\D/g, '');
  const celularOk = !celular || (celularLimpo.length >= 10 && celularLimpo.length <= 13);
  return (
    <section className="cartao">
      <h2 style={{ fontSize: 15, fontWeight: 800 }}>Contato e avisos</h2>
      <label className="campo">
        E-mail
        <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@exemplo.com" />
        {!emailOk && <span className="dica" style={{ color: 'var(--terracota-texto)' }}>E-mail inválido.</span>}
      </label>
      <label className="campo">
        Celular (com DDD)
        <input type="tel" inputMode="tel" autoComplete="tel" value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="(11) 91234-5678" />
        {!celularOk && <span className="dica" style={{ color: 'var(--terracota-texto)' }}>Celular inválido.</span>}
      </label>
      <label className="linha pequeno" style={{ gap: 10 }}>
        <input type="checkbox" checked={noCelular} onChange={(e) => setNoCelular(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--terracota)' }} />
        Receber avisos no celular (limite do cartão, parcelas, resumo do mês)
      </label>
      <label className="linha pequeno" style={{ gap: 10 }}>
        <input type="checkbox" checked={porEmail} onChange={(e) => setPorEmail(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--terracota)' }} />
        Receber também por e-mail (quando ativado pela administradora)
      </label>
      <label className="linha pequeno" style={{ gap: 10 }}>
        <input type="checkbox" checked={agentes} onChange={(e) => setAgentes(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--terracota)' }} />
        Avisos dos agentes (Nina, Gabriela, Matheus e Leo avisam por conta própria: plano atrasado, cartão quase no fim, Selic mudou). Desmarque para eles só responderem quando você chamar.
      </label>
      <span className="mini suave">Seus contatos ficam guardados no seu celular e só são usados para os avisos do app.</span>
      <button
        type="button"
        className="botao pequeno"
        disabled={!emailOk || !celularOk}
        onClick={async () => {
          let permitido = noCelular;
          if (noCelular) permitido = await pedirPermissaoAvisos();
          await db.perfil.update('eu', { email: email.trim() || undefined, celular: celularLimpo || undefined, avisos: { celular: permitido, email: porEmail, agentes } });
          setNoCelular(permitido);
          aoSalvar(noCelular && !permitido ? 'Salvo. Para receber avisos no celular, permita as notificações do app nas configurações do aparelho.' : 'Contato e avisos salvos.');
        }}
      >
        Salvar
      </button>
    </section>
  );
}

/** Trocar a senha da conta (e-mail + senha). Os outros aparelhos são desconectados. */
export function TrocarSenha({ aoSalvar }: { aoSalvar: (m: string) => void }) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  async function salvar() {
    setErro('');
    if (nova.length < 8 || !/[a-zA-ZÀ-ú]/.test(nova) || !/\d/.test(nova)) return setErro('A senha nova precisa ter pelo menos 8 caracteres, com letras e números.');
    if (nova !== repetir) return setErro('As duas senhas novas não estão iguais.');
    setOcupado(true);
    try {
      const r = await fetch('/api/conta/senha', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ atual, nova }) });
      const c = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) throw new Error(c.erro ?? 'Não foi possível agora.');
      setAtual('');
      setNova('');
      setRepetir('');
      aoSalvar('Senha trocada. Os outros aparelhos foram desconectados.');
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  return (
    <details>
      <summary className="pequeno" style={{ cursor: 'pointer', fontWeight: 700 }}>Trocar a senha da conta</summary>
      <div className="coluna" style={{ gap: 10, marginTop: 10 }}>
        <label className="campo">Senha atual<input type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} /></label>
        <label className="campo">Senha nova<input type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} /></label>
        <label className="campo">Repita a senha nova<input type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} /></label>
        <button type="button" className="botao pequeno" disabled={ocupado || !atual || !nova || !navigator.onLine} onClick={salvar}>{ocupado ? 'Salvando…' : 'Salvar senha nova'}</button>
        {erro && <p className="pequeno" role="alert">{erro}</p>}
      </div>
    </details>
  );
}
