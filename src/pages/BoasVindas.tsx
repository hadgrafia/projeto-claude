import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone, ICONE_PLANO } from '../components/Icone';
import { CampoDinheiro, Segmentado } from '../components/Ui';
import { CriarSenha } from '../components/Bloqueio';
import { Logo } from '../components/Logo';
import { PerguntasPerfil } from '../components/PerguntasPerfil';
import { convitePendente } from './Convite';
import { db, type Perfil, type Tema, type TipoPlano } from '../db';
import { reais } from '../lib/format';
import { calcularPerfil, PERGUNTAS_PERFIL } from '../lib/invest';
import { PLANOS } from '../lib/planos';
import { ehAppAndroid, Leitor } from '../lib/nativo';

const ehAndroidNativo = ehAppAndroid;
const ehIPhone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export default function BoasVindas() {
  const navegar = useNavigate();
  const [passo, setPasso] = useState(0);
  const [metodo, setMetodo] = useState<Perfil['metodo']>();
  const [nome, setNome] = useState('');
  const [tema, setTema] = useState<Tema>('sistema');
  const [renda, setRenda] = useState<number>();
  const [gasto, setGasto] = useState<number>();
  const [respostas, setRespostas] = useState<(number | undefined)[]>([]);
  const [senhaCriada, setSenhaCriada] = useState(false);
  const [aviso, setAviso] = useState('');
  const convite = convitePendente();

  /** Todas as respostas são obrigatórias: diz o que falta em cada etapa. */
  const falta = (p: number): string => {
    if (p === 0 && !metodo) return 'Escolha como você quer registrar os gastos.';
    if (p === 1 && nome.trim().length < 2) return 'Diga como podemos te chamar.';
    if (p === 2 && !senhaCriada) return 'Crie a senha do app para continuar.';
    if (p === 3 && !(renda && renda > 0)) return 'Informe quanto você recebe por mês.';
    if (p === 3 && !(gasto && gasto > 0)) return 'Informe quanto você gasta por mês, mais ou menos.';
    if (p === 4 && PERGUNTAS_PERFIL.some((_, i) => respostas[i] === undefined)) return 'Responda as 3 perguntas.';
    return '';
  };
  const avancar = () => {
    const f = falta(passo);
    if (f) return setAviso(f);
    setAviso('');
    setPasso(passo + 1);
  };

  async function concluir(tipo?: TipoPlano) {
    await db.perfil.put({
      id: 'eu',
      nome: nome.trim(),
      rendaMensal: renda ?? 0,
      rendaAtualizadaEm: new Date().toISOString(),
      gastoMensalEstimado: gasto ?? 0,
      perfilRisco: calcularPerfil(respostas.map((r) => r ?? 0)),
      tema,
      metodo: metodo ?? 'manual',
      concluiuInicio: true,
      criadoEm: new Date().toISOString(),
    });
    navegar(convite ?? (tipo ? `/planos/novo?tipo=${tipo}&primeiro=1` : '/inicio'), { replace: true });
    if (metodo === 'notificacoes' && ehAppAndroid()) {
      // Permissão para avisar "Onde foi este gasto?" e para ler as notificações de pagamento.
      await Leitor.pedirPermissaoAvisos().catch(() => undefined);
      const { permitido } = await Leitor.status();
      if (!permitido) await Leitor.abrirPermissao();
    }
  }

  const passos = [
    // 0 — privacidade e forma de registrar
    <>
      <div className="linha">
        <Logo tamanho={44} />
        <strong>Meus Planos Financeiros</strong>
      </div>
      <h1 className="titulo" style={{ fontSize: 30 }}>Seus dados ficam com você</h1>
      <div className="cartao verde">
        {[
          'Nunca abrimos o app do seu banco nem pedimos senha.',
          'Lemos só avisos de pagamento e de dinheiro recebido, ou o extrato que você enviar.',
          'Tudo fica guardado na sua conta, cifrado: volta em qualquer aparelho e funciona sem internet.',
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
          {
            v: 'notificacoes',
            t: 'Registrar pelos avisos do banco',
            d: ehAndroidNativo()
              ? 'Qualquer banco ou app de pagamento: o app lê o aviso de pagamento na hora. Basta as notificações estarem ativadas.'
              : 'Compartilhe o comprovante com o Meus Planos ou use uma automação do celular, e o gasto chega preenchido. Passo a passo em Ajustes.',
            ic: 'sino',
            ok: true,
          },
          { v: 'extrato', t: 'Enviar o extrato do mês', d: 'Android e iPhone. PDF, OFX ou CSV que você baixa do seu banco. Você continua com 100% do controle.', ic: 'documento', ok: true },
          { v: 'manual', t: 'Anotar eu mesma', d: 'Registro rápido: valor e categoria.', ic: 'lapis', ok: true },
        ] as const
      ).map((o) => (
        <button
          key={o.v}
          type="button"
          disabled={!o.ok}
          aria-pressed={metodo === o.v}
          onClick={() => { setMetodo(o.v); setAviso(''); }}
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
      {metodo === 'notificacoes' && !ehAndroidNativo() && (
        <p className="cartao areia pequeno">
          {ehIPhone()
            ? 'No iPhone, use o app Atalhos: cada compra com Apple Pay abre o Meus Planos já preenchida. O passo a passo fica em Ajustes.'
            : 'Pelo navegador, o celular não deixa nenhum site ler notificações sozinho. Por isso, o app usa o "Compartilhar comprovante" do seu banco ou uma automação gratuita. O passo a passo fica em Ajustes.'}
        </p>
      )}
    </>,

    // 1 — nome e tema
    <>
      <h1 className="titulo">Como podemos te chamar?</h1>
      <label className="campo">
        Seu nome ou apelido
        <input value={nome} onChange={(e) => { setNome(e.target.value); setAviso(''); }} autoComplete="given-name" placeholder="Ex.: Ana" required aria-required="true" />
        <span className="dica">Obrigatório. Fica na sua conta e aparece para o grupo nos planos em conjunto.</span>
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

    // 2 — segurança: senha obrigatória e biometria opcional
    <>
      <h1 className="titulo">Proteja seus dados</h1>
      <p className="subtitulo">Ninguém além de você abre o app: ele pede a senha (ou sua digital ou rosto) toda vez que é aberto.</p>
      {senhaCriada ? (
        <div className="cartao manter" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Icone nome="check" tamanho={32} />
          <strong>Senha criada</strong>
        </div>
      ) : (
        <CriarSenha aoConcluir={() => { setSenhaCriada(true); setAviso(''); setPasso(3); }} />
      )}
    </>,

    // 3 — renda e gastos
    <>
      <h1 className="titulo">Quanto você recebe por mês?</h1>
      <p className="subtitulo">Use o valor do seu salário (ou recebimento) mais recente. Se mudar, é só ajustar quando quiser no Início ou em Ajustes.</p>
      <CampoDinheiro rotulo="Renda mensal" valor={renda} aoMudar={(v) => { setRenda(v); setAviso(''); }} dica="Obrigatório." />
      <CampoDinheiro rotulo="Quanto você gasta por mês, mais ou menos?" valor={gasto} aoMudar={(v) => { setGasto(v); setAviso(''); }} dica="Obrigatório. Uma estimativa basta: quando houver gastos registrados, o app usa os reais." />
      {renda && gasto ? (
        <div className={`cartao ${gasto >= renda ? 'areia' : 'verde'}`}>
          <span className="suave pequeno">Sobra por mês para os seus planos</span>
          <strong className="valor-grande" style={{ fontSize: 28 }}>{reais(Math.max(0, renda - gasto))}</strong>
          {gasto >= renda && <span className="pequeno">Seus gastos estão iguais ou maiores que a renda. A aba Conselhos vai mostrar onde dá para economizar.</span>}
        </div>
      ) : null}
    </>,

    // 4 — perfil de investidor
    <>
      <h1 className="titulo">Seu jeito de investir</h1>
      <p className="subtitulo">3 perguntas para o app sugerir onde guardar o dinheiro de cada plano.</p>
      <PerguntasPerfil respostas={respostas} aoResponder={(i, v) => { setRespostas((r) => Object.assign([...r], { [i]: v })); setAviso(''); }} />
    </>,

    // 5 — primeiro plano
    <>
      <h1 className="titulo">Qual é o seu primeiro plano?</h1>
      <p className="subtitulo">Escolha um para começar. Depois você pode criar quantos quiser, cada um com sua meta.</p>
      {convite && (
        <button type="button" className="botao terracota" onClick={() => concluir()}>
          Entrar no plano do convite
        </button>
      )}
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
      {aviso && (
        <motion.p key={aviso} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="cartao areia pequeno" role="alert">
          {aviso}
        </motion.p>
      )}
      {passo < passos.length - 1 && (passo !== 2 || senhaCriada) && (
        <div className="linha" style={{ marginTop: 8 }}>
          {passo > 0 && (
            <button type="button" className="circulo escuro" style={{ width: 52, height: 52 }} aria-label="Voltar" onClick={() => { setAviso(''); setPasso(passo - 1); }}>
              <Icone nome="voltar" />
            </button>
          )}
          <motion.button type="button" whileTap={{ scale: 0.97 }} className="botao seta cresce" onClick={avancar} aria-disabled={Boolean(falta(passo))} style={{ opacity: falta(passo) ? 0.55 : 1 }}>
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
