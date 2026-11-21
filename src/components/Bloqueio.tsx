import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ativarBiometria,
  biometriaDisponivel,
  conferirPin,
  definirPin,
  desbloquearComBiometria,
  lerBloqueio,
  pinValido,
  type ConfigBloqueio,
} from '../lib/bloqueio';
import { Icone } from './Icone';

/** Controla quando o app fica bloqueado: ao abrir e ao voltar depois de um tempo fora. */
export function useBloqueio() {
  const [config, setConfig] = useState<ConfigBloqueio | null>();
  const [travado, setTravado] = useState(true);
  const [oculto, setOculto] = useState(false);
  const saiuEm = useRef<number>();

  useEffect(() => {
    lerBloqueio().then((c) => {
      setConfig(c ?? null);
      setTravado(Boolean(c?.ativo));
    });
  }, []);

  useEffect(() => {
    const mudou = async () => {
      if (document.visibilityState === 'hidden') {
        saiuEm.current = Date.now();
        setOculto(true); // esconde valores na tela de apps recentes
        return;
      }
      setOculto(false);
      const c = await lerBloqueio();
      setConfig(c ?? null);
      if (c?.ativo && saiuEm.current !== undefined && Date.now() - saiuEm.current >= c.bloquearApos * 1000) setTravado(true);
    };
    document.addEventListener('visibilitychange', mudou);
    return () => document.removeEventListener('visibilitychange', mudou);
  }, []);

  return { carregado: config !== undefined, travado: travado && Boolean(config?.ativo), oculto, destravar: () => setTravado(false), config };
}

export function TecladoPin({ valor, aoMudar, aoBiometria, desativado }: { valor: string; aoMudar: (v: string) => void; aoBiometria?: () => void; desativado?: boolean }) {
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'apagar'];
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (desativado) return;
      if (/^\d$/.test(e.key) && valor.length < 6) aoMudar(valor + e.key);
      if (e.key === 'Backspace') aoMudar(valor.slice(0, -1));
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [valor, aoMudar, desativado]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 16, justifyContent: 'center' }}>
      {teclas.map((t) =>
        t === 'bio' ? (
          aoBiometria ? (
            <motion.button key={t} type="button" whileTap={{ scale: 0.9 }} className="circulo card" style={{ width: 72, height: 72 }} aria-label="Usar digital ou rosto" onClick={aoBiometria} disabled={desativado}>
              <Icone nome="escudo" tamanho={26} />
            </motion.button>
          ) : (
            <span key={t} />
          )
        ) : t === 'apagar' ? (
          <motion.button key={t} type="button" whileTap={{ scale: 0.9 }} className="circulo" style={{ width: 72, height: 72, background: 'transparent', border: 0 }} aria-label="Apagar" onClick={() => aoMudar(valor.slice(0, -1))} disabled={desativado}>
            <Icone nome="voltar" tamanho={26} />
          </motion.button>
        ) : (
          <motion.button
            key={t}
            type="button"
            whileTap={{ scale: 0.9 }}
            className="circulo card"
            style={{ width: 72, height: 72, fontSize: 26, fontWeight: 700 }}
            onClick={() => valor.length < 6 && aoMudar(valor + t)}
            disabled={desativado}
          >
            {t}
          </motion.button>
        ),
      )}
    </div>
  );
}

function Pontos({ n, controles }: { n: number; controles: ReturnType<typeof useAnimationControls> }) {
  return (
    <motion.div animate={controles} className="linha" style={{ justifyContent: 'center', gap: 14 }} aria-label={`${n} de 6 dígitos`}>
      {Array.from({ length: 6 }, (_, i) => (
        <motion.span
          key={i}
          animate={{ scale: i < n ? 1.15 : 1, background: i < n ? 'var(--terracota)' : 'transparent' }}
          style={{ width: 16, height: 16, borderRadius: 999, border: '2px solid var(--terracota)' }}
        />
      ))}
    </motion.div>
  );
}

/** Tela que cobre todo o app até a pessoa se identificar. */
export function TelaBloqueio({ config, aoDestravar }: { config: ConfigBloqueio; aoDestravar: () => void }) {
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');
  const [travadoAte, setTravadoAte] = useState(config.travadoAte && config.travadoAte > Date.now() ? config.travadoAte : 0);
  const [agora, setAgora] = useState(Date.now());
  const tremer = useAnimationControls();
  const temBio = Boolean(config.biometria);

  const bio = useCallback(async () => {
    if (await desbloquearComBiometria()) aoDestravar();
  }, [aoDestravar]);

  useEffect(() => {
    if (temBio) bio();
  }, [temBio, bio]);

  useEffect(() => {
    if (!travadoAte) return;
    const t = setInterval(() => {
      setAgora(Date.now());
      if (Date.now() >= travadoAte) setTravadoAte(0);
    }, 500);
    return () => clearInterval(t);
  }, [travadoAte]);

  useEffect(() => {
    if (pin.length !== 6) return;
    conferirPin(pin).then((r) => {
      if (r.ok) return aoDestravar();
      setPin('');
      tremer.start({ x: [0, -12, 12, -8, 8, 0], transition: { duration: 0.4 } });
      if (r.travadoAte) {
        setTravadoAte(r.travadoAte);
        setMsg('Muitas tentativas erradas.');
      } else setMsg(`Senha incorreta. ${r.restantes} ${r.restantes === 1 ? 'tentativa' : 'tentativas'} antes de travar.`);
    });
  }, [pin, aoDestravar, tremer]);

  const espera = travadoAte ? Math.ceil((travadoAte - agora) / 1000) : 0;

  return (
    <motion.main className="tela sem-nav" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }} style={{ minHeight: '100dvh', justifyContent: 'center', alignItems: 'center', gap: 28 }}>
      <div className="circulo verde" style={{ width: 72, height: 72, borderRadius: 22 }}>
        <svg width={40} height={40} viewBox="0 0 48 48" aria-hidden="true">
          <path d="M8 22 L24 9 L40 22 V40 H8 Z" fill="#F0EBE1" />
          <path d="M8 29 H40 V40 H8 Z" fill="#B4552D" />
        </svg>
      </div>
      <div className="coluna" style={{ alignItems: 'center', gap: 6 }}>
        <h1 className="titulo" style={{ fontSize: 22 }}>Digite sua senha</h1>
        <p className="pequeno suave" role="status" style={{ minHeight: 20, textAlign: 'center' }}>
          {espera > 0 ? `Muitas tentativas. Tente de novo em ${espera} s.` : msg}
        </p>
      </div>
      <Pontos n={pin.length} controles={tremer} />
      <TecladoPin valor={pin} aoMudar={setPin} aoBiometria={temBio ? bio : undefined} desativado={espera > 0} />
    </motion.main>
  );
}

/** Criar (ou trocar) a senha de 6 dígitos e, se o aparelho tiver, ativar digital/rosto. */
export function CriarSenha({ aoConcluir, atual }: { aoConcluir: () => void; atual?: ConfigBloqueio }) {
  const [etapa, setEtapa] = useState<'criar' | 'confirmar' | 'bio'>('criar');
  const [pin, setPin] = useState('');
  const [primeiro, setPrimeiro] = useState('');
  const [msg, setMsg] = useState('');
  const [temBio, setTemBio] = useState(false);
  const tremer = useAnimationControls();

  useEffect(() => {
    biometriaDisponivel().then(setTemBio);
  }, []);

  useEffect(() => {
    if (pin.length !== 6) return;
    if (etapa === 'criar') {
      if (!pinValido(pin)) {
        setMsg('Evite sequências como 123456 ou 111111.');
        tremer.start({ x: [0, -10, 10, -6, 6, 0] });
        setPin('');
        return;
      }
      setPrimeiro(pin);
      setPin('');
      setMsg('');
      setEtapa('confirmar');
    } else if (etapa === 'confirmar') {
      if (pin !== primeiro) {
        setMsg('As senhas não conferem. Comece de novo.');
        tremer.start({ x: [0, -10, 10, -6, 6, 0] });
        setPin('');
        setPrimeiro('');
        setEtapa('criar');
        return;
      }
      definirPin(pin, atual).then(() => (temBio && !atual?.biometria ? setEtapa('bio') : aoConcluir()));
    }
  }, [pin, etapa, primeiro, temBio, atual, aoConcluir, tremer]);

  if (etapa === 'bio') {
    return (
      <div className="coluna" style={{ gap: 14, alignItems: 'stretch' }}>
        <div className="cartao verde" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Icone nome="escudo" tamanho={40} cor="#D9774F" />
          <strong style={{ fontSize: 18 }}>Desbloquear com digital ou rosto?</strong>
          <span className="suave pequeno">É mais rápido. A senha continua valendo se a biometria falhar.</span>
        </div>
        <button
          type="button"
          className="botao"
          onClick={async () => {
            try {
              await ativarBiometria();
              aoConcluir();
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          Ativar biometria
        </button>
        <button type="button" className="botao secundario" onClick={aoConcluir}>Agora não</button>
        {msg && <p className="pequeno suave">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="coluna" style={{ gap: 22, alignItems: 'center' }}>
      <AnimatePresence mode="wait">
        <motion.div key={etapa} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="coluna" style={{ alignItems: 'center', gap: 4 }}>
          <strong style={{ fontSize: 18 }}>{etapa === 'criar' ? 'Crie uma senha de 6 números' : 'Digite a senha de novo'}</strong>
          <span className="pequeno suave" role="status" style={{ minHeight: 20, textAlign: 'center' }}>{msg || 'Ela é pedida toda vez que o app abre.'}</span>
        </motion.div>
      </AnimatePresence>
      <Pontos n={pin.length} controles={tremer} />
      <TecladoPin valor={pin} aoMudar={setPin} />
    </div>
  );
}

/** Capa que esconde os valores quando o app vai para segundo plano. */
export const CapaPrivacidade = () => (
  <div style={{ position: 'fixed', inset: 0, background: 'var(--verde)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <svg width={64} height={64} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 22 L24 9 L40 22 V40 H8 Z" fill="#F0EBE1" />
      <path d="M8 29 H40 V40 H8 Z" fill="#B4552D" />
    </svg>
  </div>
);
