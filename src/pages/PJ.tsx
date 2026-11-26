import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import { BotaoSalvar, CampoDinheiro, Segmentado } from '../components/Ui';
import { db } from '../db';
import { useDados } from '../hooks';
import { mesLongo, reais } from '../lib/format';
import { agendarLembretesDas, desfazerDas, LINKS_PJ, pagarDas, situacaoDas, type Das } from '../lib/pj';

/** PJ: DAS do mês (lembrete, "Paguei" e histórico) e atalhos para gerar a guia e emitir notas. */
export default function PJ() {
  const navegar = useNavigate();
  const { perfil } = useDados();
  const das = perfil?.das;
  const s = situacaoDas(das);
  const [valor, setValor] = useState<number>();
  useEffect(() => setValor(s?.media ? Math.round(s.media * 100) / 100 : undefined), [s?.media]);

  return (
    <main className="tela sem-nav">
      <div className="linha">
        <button type="button" className="circulo escuro" aria-label="Voltar" onClick={() => navegar(-1)}><Icone nome="voltar" /></button>
        <h1 className="titulo" style={{ fontSize: 24 }}>Impostos e notas (PJ)</h1>
      </div>

      {!das ? (
        <ConfigDas />
      ) : (
        <>
          <section className={`cartao ${s?.pago ? 'verde' : s?.atrasado ? 'alerta-vermelho' : 'terracota'}`} style={{ gap: 8 }}>
            <span className="mini" style={{ opacity: 0.85 }}>DAS de {mesLongo(s!.mes)}</span>
            <strong style={{ fontSize: 22 }}>
              {s?.pago ? `Paga: ${reais(s.pago.valor)}` : s?.atrasado ? `Em atraso desde o dia ${das.dia}` : s?.dias === 0 ? 'Vence hoje' : `Vence dia ${das.dia} (em ${s?.dias} ${s?.dias === 1 ? 'dia' : 'dias'})`}
            </strong>
            {s?.media && !s.pago ? <span className="pequeno">Valor médio dos últimos meses: {reais(s.media)}. O valor muda: confira na guia.</span> : null}
            <a className="botao pequeno" style={{ background: '#fff', color: 'var(--texto)', textAlign: 'center' }} href={das.tipo === 'mei' ? LINKS_PJ.dasMei : LINKS_PJ.portalSimples} target="_blank" rel="noopener noreferrer">
              Gerar a guia da DAS ({das.tipo === 'mei' ? 'PGMEI' : 'Simples Nacional'})
            </a>
          </section>

          {!s?.pago ? (
            <section className="cartao" style={{ gap: 10 }}>
              <CampoDinheiro rotulo="Valor pago" valor={valor} aoMudar={setValor} dica="Entra como gasto (categoria Impostos) e na média de gastos do mês." />
              <BotaoSalvar disabled={!valor} salvo="Marcada como paga" aoSalvar={() => (valor ? pagarDas(valor) : false)}>Paguei a DAS deste mês</BotaoSalvar>
            </section>
          ) : (
            <button type="button" className="botao secundario pequeno" onClick={() => confirm('Desfazer o pagamento deste mês? O gasto registrado também é apagado.') && desfazerDas(s.mes)}>Desfazer pagamento deste mês</button>
          )}

          <a className="cartao cartao-link" href={LINKS_PJ.nfse} target="_blank" rel="noopener noreferrer" style={{ flexDirection: 'row', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
            <span className="circulo verde"><Icone nome="documento" /></span>
            <span className="cresce coluna" style={{ gap: 2 }}>
              <strong>Emitir nota fiscal (NFS-e)</strong>
              <span className="pequeno suave">Emissor Nacional, do governo (abre fora do app).</span>
            </span>
            <Icone nome="link" />
          </a>

          {s && s.historico.length > 0 && (
            <details className="cartao">
              <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Histórico da DAS</summary>
              <div className="lista" style={{ marginTop: 8 }}>
                {s.historico.slice(0, 12).map(([mes, p]) => (
                  <div key={mes} className="item" style={{ cursor: 'default' }}>
                    <span className="cresce" style={{ textTransform: 'capitalize' }}>{mesLongo(mes)} de {mes.slice(0, 4)}</span>
                    <strong className="num">{reais(p.valor)}</strong>
                  </div>
                ))}
              </div>
            </details>
          )}

          <details className="cartao">
            <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Ajustar lembrete da DAS</summary>
            <ConfigDas atual={das} />
          </details>
        </>
      )}
      <p className="mini suave">
        Os links abrem os sites oficiais do governo (Receita Federal e Emissor Nacional). O app não entra neles por você e nunca pede certificado, CNPJ ou senha.{' '}
        <Link to="/ajustes">Ajustes</Link>
      </p>
    </main>
  );
}

function ConfigDas({ atual }: { atual?: Das }) {
  const [tipo, setTipo] = useState<Das['tipo']>(atual?.tipo ?? 'mei');
  const [dia, setDia] = useState(String(atual?.dia ?? 20));
  const [estimado, setEstimado] = useState<number | undefined>(atual?.valorEstimado);
  const n = Math.floor(Number(dia));
  const ok = n >= 1 && n <= 31;
  return (
    <section className="cartao" style={{ gap: 12 }}>
      {!atual && <p className="pequeno">Todo mês tem DAS, e o valor muda. Diga o dia do vencimento: o app avisa 3 dias antes e no dia, mesmo com o app fechado (Android).</p>}
      <Segmentado rotulo="Tipo de empresa" valor={tipo} aoMudar={setTipo} opcoes={[{ valor: 'mei', rotulo: 'MEI' }, { valor: 'simples', rotulo: 'Simples Nacional' }]} />
      <label className="campo">
        Dia do vencimento da DAS
        <input inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        <span className="mini suave">A DAS do MEI e do Simples vence normalmente no dia 20.</span>
      </label>
      <CampoDinheiro rotulo="Valor aproximado (opcional)" valor={estimado} aoMudar={setEstimado} dica="Usado até você marcar os primeiros pagamentos." />
      <BotaoSalvar
        disabled={!ok}
        salvo="Lembrete salvo"
        aoSalvar={async () => {
          const das: Das = { tipo, dia: n, valorEstimado: estimado, pagos: atual?.pagos ?? {} };
          await db.perfil.update('eu', { das });
          await agendarLembretesDas(das);
        }}
      >
        {atual ? 'Salvar' : 'Ativar lembrete da DAS'}
      </BotaoSalvar>
    </section>
  );
}
