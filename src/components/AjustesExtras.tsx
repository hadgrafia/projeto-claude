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
      <span className="mini suave">Seus contatos ficam guardados no seu celular e só são usados para os avisos do app.</span>
      <button
        type="button"
        className="botao pequeno"
        disabled={!emailOk || !celularOk}
        onClick={async () => {
          let permitido = noCelular;
          if (noCelular) permitido = await pedirPermissaoAvisos();
          await db.perfil.update('eu', { email: email.trim() || undefined, celular: celularLimpo || undefined, avisos: { celular: permitido, email: porEmail } });
          setNoCelular(permitido);
          aoSalvar(noCelular && !permitido ? 'Salvo. Para receber avisos no celular, permita as notificações do app nas configurações do aparelho.' : 'Contato e avisos salvos.');
        }}
      >
        Salvar
      </button>
    </section>
  );
}
