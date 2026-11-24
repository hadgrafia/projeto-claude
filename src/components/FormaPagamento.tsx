import { useEffect, useState } from 'react';
import { db, type FormaPag, type Movimento, type Perfil } from '../db';
import { conferirLimiteCartao } from '../lib/avisos';
import { NOMES_FORMA } from '../lib/cartao';
import { aprenderForma, ehAppAndroid, Leitor, lugarInformadoNoApp } from '../lib/nativo';
import { BotaoSalvar } from './Ui';
import { Icone } from './Icone';
import { BotaoNaoEraGasto } from './Lugar';
import { hora, reais } from '../lib/format';

const OPCOES: FormaPag[] = ['debito', 'pix', 'credito', 'dinheiro', 'boleto'];

/** Escolha de como foi pago; no crédito, também em quantas vezes. */
export function CampoForma({ forma, parcelas, aoMudar, rotulo = 'Como foi pago?' }: { forma?: FormaPag; parcelas?: number; aoMudar: (forma: FormaPag, parcelas?: number) => void; rotulo?: string }) {
  return (
    <div className="campo">
      {rotulo}
      <div className="chips" role="radiogroup" aria-label={rotulo}>
        {OPCOES.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={forma === f}
            className="chip"
            onClick={() => aoMudar(f, f === 'credito' ? parcelas ?? 1 : undefined)}
            style={forma === f ? { background: f === 'credito' ? 'var(--terracota)' : 'var(--verde)', color: '#fff' } : undefined}
          >
            {f === 'pix' ? 'Pix' : NOMES_FORMA[f]}
          </button>
        ))}
      </div>
      {forma === 'credito' && (
        <label className="campo" style={{ marginTop: 6 }}>
          Em quantas vezes?
          <select value={parcelas ?? 1} onChange={(e) => aoMudar('credito', Number(e.target.value))}>
            <option value={1}>À vista (1x)</option>
            {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}x</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

/** Pergunta "débito ou crédito?" para um gasto que chegou sem essa informação. */
export function FormForma({ mov, restantes, aoAdiar, segurar }: { mov: Movimento; restantes: number; aoAdiar: () => void; segurar?: (m?: Movimento) => void }) {
  const [forma, setForma] = useState<FormaPag>();
  const [parcelas, setParcelas] = useState(1);

  async function salvar() {
    if (!forma) return false;
    segurar?.(mov);
    await db.movimentos.update(mov.id!, { forma, parcelas: forma === 'credito' && parcelas > 1 ? parcelas : undefined, formaPendente: false });
    // Responde uma vez: as próximas compras deste cartão (ou deste banco) entram sozinhas.
    if (mov.origem === 'notificacao') await aprenderForma(forma, mov.cartaoFinal, mov.avisadoPor);
    if (forma === 'credito') conferirLimiteCartao().catch(() => undefined);
    // Respondido no app: fecha a pergunta que estava na notificação.
    if (!mov.localPendente) lugarInformadoNoApp(mov.chave);
  }

  return (
    <>
      <div className="cartao verde">
        <span className="suave pequeno">{mov.local ?? mov.descricao}{mov.avisadoPor ? ` · aviso do ${mov.avisadoPor}` : ''} · {hora(mov.data)}</span>
        <strong className="valor-grande" style={{ fontSize: 30 }}>{reais(mov.valor)}</strong>
        <span className="suave pequeno">
          O aviso não disse se foi no débito ou no crédito. Responda uma vez: as próximas compras {mov.cartaoFinal ? `do cartão final ${mov.cartaoFinal}` : mov.avisadoPor ? `do ${mov.avisadoPor}` : 'iguais'} entram sozinhas.
        </span>
      </div>
      <CampoForma
        rotulo="Foi no débito ou no crédito?"
        forma={forma}
        parcelas={parcelas}
        aoMudar={(f, n) => {
          setForma(f);
          if (n) setParcelas(n);
        }}
      />
      {forma === 'credito' && parcelas > 1 && <span className="mini suave">{parcelas}x de {reais(mov.valor / parcelas)}. Se o valor do aviso já era o da parcela, corrija o valor no gasto depois.</span>}
      <BotaoSalvar disabled={!forma} aoSalvar={salvar} depois={() => segurar?.(undefined)} />
      <button type="button" className="botao secundario" onClick={aoAdiar}>Responder depois{restantes > 0 ? ` (${restantes} na fila)` : ''}</button>
      {mov.origem === 'notificacao' && <BotaoNaoEraGasto mov={mov} segurar={segurar} />}
    </>
  );
}

/**
 * Ajustes: débito ou crédito automático. Mostra o que o app já aprendeu (por cartão e por banco),
 * deixa trocar ou apagar cada regra e escolher o que fazer quando não souber.
 */
export function FormaAutomatica({ perfil }: { perfil: Perfil }) {
  const m = perfil.formasAprendidas ?? { cartoes: {}, apps: {} };
  const regras = [
    ...Object.entries(m.cartoes).map(([k, f]) => ({ tipo: 'cartoes' as const, chave: k, rotulo: `Cartão final ${k}`, forma: f })),
    ...Object.entries(m.apps).map(([k, f]) => ({ tipo: 'apps' as const, chave: k, rotulo: `${k} (sem o final do cartão no aviso)`, forma: f })),
  ];
  const mudar = async (tipo: 'cartoes' | 'apps', chave: string, forma?: FormaPag) => {
    const novo = { ...m, [tipo]: { ...m[tipo] } };
    if (forma) novo[tipo][chave] = forma;
    else delete novo[tipo][chave];
    await db.perfil.update('eu', { formasAprendidas: novo });
  };
  return (
    <section className="cartao" id="forma-automatica">
      <h2 style={{ fontSize: 15, fontWeight: 800 }}>Débito ou crédito automático</h2>
      <p className="mini suave">
        Quando o aviso do banco não diz, o app usa o que você já respondeu para aquele cartão (pelo final, ex.: 1234) ou para aquele banco. Responda uma vez e as próximas compras entram sozinhas.
      </p>
      <label className="campo">
        Quando o app ainda não souber
        <select value={perfil.formaPadrao ?? 'perguntar'} onChange={(e) => db.perfil.update('eu', { formaPadrao: e.target.value as Perfil['formaPadrao'] })}>
          <option value="perguntar">Perguntar uma vez (na notificação)</option>
          <option value="credito">Considerar crédito</option>
          <option value="debito">Considerar débito</option>
        </select>
      </label>
      {regras.length === 0 ? (
        <p className="pequeno suave">Nenhuma regra ainda. Elas aparecem aqui conforme você responde.</p>
      ) : (
        <div className="lista">
          {regras.map((r) => (
            <div key={r.tipo + r.chave} className="item" style={{ cursor: 'default' }}>
              <span className="cresce pequeno"><strong>{r.rotulo}</strong></span>
              <select aria-label={`Forma de ${r.rotulo}`} value={r.forma} onChange={(e) => mudar(r.tipo, r.chave, e.target.value as FormaPag)} style={{ width: 'auto', padding: '8px 12px', borderRadius: 12, fontSize: 14 }}>
                <option value="credito">Crédito</option>
                <option value="debito">Débito</option>
              </select>
              <button type="button" className="circulo card" aria-label={`Apagar regra de ${r.rotulo}`} onClick={() => mudar(r.tipo, r.chave)}>
                <Icone nome="lixo" tamanho={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Início (app Android): o app lê os avisos, mas não tem permissão para mostrar notificações.
 * Sem ela, a pergunta "débito ou crédito?" não aparece na hora da compra.
 */
export function AvisosDoCelular() {
  const [falta, setFalta] = useState(false);
  useEffect(() => {
    if (!ehAppAndroid()) return;
    Leitor.status()
      .then((s) => setFalta(s.permitido && !s.avisosPermitidos))
      .catch(() => undefined);
  }, []);
  if (!falta) return null;
  return (
    <button
      type="button"
      className="cartao terracota cartao-link"
      style={{ gridColumn: '1 / -1', border: 0, textAlign: 'left', cursor: 'pointer', flexDirection: 'row', alignItems: 'center' }}
      onClick={async () => setFalta(!(await Leitor.pedirPermissaoAvisos()).avisosPermitidos)}
    >
      <span className="circulo" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}><Icone nome="sino" /></span>
      <span className="cresce coluna" style={{ gap: 2 }}>
        <strong>Ative as notificações do Meus Planos</strong>
        <span className="pequeno">Sem elas, o app não consegue perguntar na hora da compra. Toque e permita.</span>
      </span>
    </button>
  );
}
