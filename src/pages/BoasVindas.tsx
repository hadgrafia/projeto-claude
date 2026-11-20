import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone, ICONE_PLANO } from '../components/Icone';
import { CampoDinheiro, Segmentado } from '../components/Ui';
import { db, type Perfil, type Tema, type TipoPlano } from '../db';
import { mesLongo, reais, ultimosMeses } from '../lib/format';
import { calcularPerfil, PERGUNTAS_PERFIL } from '../lib/invest';
import { PLANOS } from '../lib/planos';

const ehAndroidNativo = () => Boolean((window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() === 'android');
const ehIPhone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export default function BoasVindas() {
  const navegar = useNavigate();
  const [passo, setPasso] = useState(0);
  const [metodo, setMetodo] = useState<Perfil['metodo']>(ehAndroidNativo() ? 'notificacoes' : 'extrato');
  const [nome, setNome] = useState('');
  const [tema, setTema] = useState<Tema>('sistema');
  const meses = ultimosMeses(6);
  const [renda, setRenda] = useState<(number | undefined)[]>(meses.map(() => undefined));
  const [gasto, setGasto] = useState<number>();
  const [respostas, setRespostas] = useState<number[]>([]);

  const media = (() => {
    const v = renda.filter((x): x is number => !!x);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  })();

  async function concluir(tipo?: TipoPlano) {
    await db.perfil.put({
      id: 'eu',
      nome: nome.trim(),
      rendaMeses: meses.map((mes, i) => ({ mes, valor: renda[i] ?? 0 })).filter((r) => r.valor > 0),
      gastoMensalEstimado: gasto ?? 0,
      perfilRisco: respostas.length === PERGUNTAS_PERFIL.length ? calcularPerfil(respostas) : undefined,
      tema,
      metodo,
      concluiuInicio: true,
      criadoEm: new Date().toISOString(),
    });
    navegar(tipo ? `/planos/novo?tipo=${tipo}&primeiro=1` : '/inicio', { replace: true });
  }

  const passos = [
    // 0 — privacidade e forma de registrar
    <>
      <div className="linha">
        <div className="circulo verde" style={{ borderRadius: 14 }}>
          <svg width={26} height={26} viewBox="0 0 48 48" aria-hidden="true">
            <path d="M8 22 L24 9 L40 22 V40 H8 Z" fill="#F0EBE1" />
            <path d="M8 29 H40 V40 H8 Z" fill="#B4552D" />
          </svg>
        </div>
        <strong>Meus Planos Financeiros</strong>
      </div>
      <h1 className="titulo" style={{ fontSize: 30 }}>Seus dados ficam com você</h1>
      <div className="cartao verde">
        {[
          'Nunca abrimos o app do seu banco nem pedimos senha.',
          'Lemos só avisos de pagamento e de dinheiro recebido, ou o extrato que você enviar.',
          'Tudo fica guardado só no seu celular e funciona sem internet.',
        ].map((t) => (
          <div key={t} className="linha" style={{ alignItems: 'flex-start', gap: 10 }}>
            <Icone nome="check" cor="#D9774F" />
            <span className="pequeno" style={{ fontSize: 14 }}>{t}</span>
          </div>
        ))}
      </div>
      <h2 style={{ fontSize: 16, fontWeight: 800 }}>Como você quer registrar os gastos?</h2>
      {(
        [
          { v: 'notificacoes', t: 'Ler notificações de pagamento', d: 'Qualquer banco ou app de pagamento. Basta as notificações estarem ativadas. Disponível no app para Android.', ic: 'sino', ok: ehAndroidNativo() },
          { v: 'extrato', t: 'Enviar o extrato do mês', d: 'Android e iPhone. PDF, OFX ou CSV que você baixa do seu banco. Você continua com 100% do controle.', ic: 'documento', ok: true },
          { v: 'manual', t: 'Anotar eu mesma', d: 'Registro rápido: valor e categoria.', ic: 'lapis', ok: true },
        ] as const
      ).map((o) => (
        <button
          key={o.v}
          type="button"
          disabled={!o.ok}
          aria-pressed={metodo === o.v}
          onClick={() => setMetodo(o.v)}
          className="cartao"
          style={{ flexDirection: 'row', alignItems: 'flex-start', textAlign: 'left', border: metodo === o.v ? '2px solid var(--verde)' : '1px solid var(--borda)', cursor: o.ok ? 'pointer' : 'default', opacity: o.ok ? 1 : 0.6 }}
        >
          <span className={`circulo ${metodo === o.v ? 'verde' : 'rever'}`}>
            <Icone nome={o.ic} />
          </span>
          <span className="coluna" style={{ gap: 4 }}>
            <strong>{o.t}</strong>
            <span className="pequeno suave">{o.d}</span>
          </span>
        </button>
      ))}
      {ehIPhone() && (
        <p className="cartao areia pequeno">No iPhone, a Apple não permite que um app leia notificações de outros apps. Use o extrato do mês ou anote os gastos.</p>
      )}
    </>,

    // 1 — nome e tema
    <>
      <h1 className="titulo">Como podemos te chamar?</h1>
      <label className="campo">
        Seu nome ou apelido
        <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="given-name" placeholder="Opcional" />
        <span className="dica">Fica só no seu celular.</span>
      </label>
      <span className="campo" style={{ marginBottom: 0 }}>Tema do app</span>
      <Segmentado
        rotulo="Tema"
        valor={tema}
        aoMudar={(t) => {
          setTema(t);
          if (t === 'sistema') document.documentElement.removeAttribute('data-tema');
          else document.documentElement.setAttribute('data-tema', t);
        }}
        opcoes={[
          { valor: 'claro', rotulo: 'Claro' },
          { valor: 'escuro', rotulo: 'Escuro' },
          { valor: 'sistema', rotulo: 'Automático' },
        ]}
      />
    </>,

    // 2 — renda e gastos
    <>
      <h1 className="titulo">Quanto você recebeu nos últimos 6 meses?</h1>
      <p className="subtitulo">Pode variar de mês a mês (PJ, freela, comissão). O app usa a média para planejar, e atualiza sozinho com as entradas detectadas.</p>
      <div className="grade-2">
        {meses.map((m, i) => (
          <CampoDinheiro
            key={m}
            rotulo={mesLongo(m).replace(/^./, (c) => c.toUpperCase())}
            valor={renda[i]}
            aoMudar={(v) => setRenda((r) => r.map((x, j) => (j === i ? v : x)))}
          />
        ))}
      </div>
      {media > 0 && (
        <div className="cartao verde">
          <span className="suave pequeno">Renda média</span>
          <strong className="valor-grande" style={{ fontSize: 28 }}>{reais(media)}</strong>
        </div>
      )}
      <CampoDinheiro rotulo="Quanto você gasta por mês, mais ou menos?" valor={gasto} aoMudar={setGasto} dica="Uma estimativa basta. Assim que houver gastos registrados, o app usa os reais." />
    </>,

    // 3 — perfil de investidor
    <>
      <h1 className="titulo">Seu jeito de investir</h1>
      <p className="subtitulo">3 perguntas para o app sugerir onde guardar o dinheiro de cada plano.</p>
      {PERGUNTAS_PERFIL.map((p, i) => (
        <fieldset key={p.id} className="cartao" style={{ border: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, padding: 0, marginBottom: 8 }}>{p.texto}</legend>
          <div className="coluna">
            {p.opcoes.map((o) => (
              <button
                key={o.rotulo}
                type="button"
                className="chip"
                style={{ textAlign: 'left', minHeight: 44 }}
                aria-pressed={respostas[i] === o.pontos}
                onClick={() => setRespostas((r) => Object.assign([...r], { [i]: o.pontos }))}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
    </>,

    // 4 — primeiro plano
    <>
      <h1 className="titulo">Qual é o seu primeiro plano?</h1>
      <p className="subtitulo">Você pode criar quantos planos quiser depois, cada um com sua meta.</p>
      <div className="grade-2">
        {(Object.keys(PLANOS) as TipoPlano[]).map((t) => (
          <motion.button key={t} type="button" whileTap={{ scale: 0.96 }} className="cartao" style={{ border: '1px solid var(--borda)', cursor: 'pointer', textAlign: 'left' }} onClick={() => concluir(t)}>
            <span className={`circulo ${t === 'casa' ? 'terracota' : 'verde'}`}>
              <Icone nome={ICONE_PLANO[t]} />
            </span>
            <strong>{PLANOS[t].nome}</strong>
          </motion.button>
        ))}
      </div>
      <button type="button" className="botao secundario" onClick={() => concluir()}>
        Criar depois
      </button>
    </>,
  ];

  return (
    <main className="tela sem-nav">
      <div className="linha" aria-label={`Passo ${passo + 1} de ${passos.length}`}>
        {passos.map((_, i) => (
          <motion.div key={i} animate={{ background: i <= passo ? 'var(--terracota)' : 'var(--areia-2)' }} style={{ height: 6, borderRadius: 999, flex: 1 }} />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={passo} className="coluna" style={{ gap: 14 }} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
          {passos[passo]}
        </motion.div>
      </AnimatePresence>
      {passo < passos.length - 1 && (
        <div className="linha" style={{ marginTop: 8 }}>
          {passo > 0 && (
            <button type="button" className="circulo escuro" style={{ width: 52, height: 52 }} aria-label="Voltar" onClick={() => setPasso(passo - 1)}>
              <Icone nome="voltar" />
            </button>
          )}
          <motion.button type="button" whileTap={{ scale: 0.97 }} className="botao seta cresce" onClick={() => setPasso(passo + 1)}>
            {passo === 0 ? 'Começar' : 'Continuar'}
            <span className="ponta">
              <Icone nome="seta" />
            </span>
          </motion.button>
        </div>
      )}
    </main>
  );
}
