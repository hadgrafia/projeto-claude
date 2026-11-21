import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Icone, type NomeIcone } from './components/Icone';
import { Logo } from './components/Logo';
import { PerguntaLocal } from './components/Lugar';
import { CapaPrivacidade, TelaBloqueio, useBloqueio } from './components/Bloqueio';
import { iniciarLeituraNativa } from './lib/nativo';
import { avisoDoMes } from './lib/avisos';
import { useDados, useOnline } from './hooks';
import Ajustes from './pages/Ajustes';
import Convite from './pages/Convite';
import Compra from './pages/Compra';
import BoasVindas from './pages/BoasVindas';
import Feedback from './pages/Feedback';
import Gastos from './pages/Gastos';
import Importar from './pages/Importar';
import Inicio from './pages/Inicio';
import Investimentos from './pages/Investimentos';
import NovoPlano from './pages/NovoPlano';
import PlanoDetalhe from './pages/PlanoDetalhe';
import Planos from './pages/Planos';

const ABAS: { para: string; rotulo: string; icone: NomeIcone }[] = [
  { para: '/inicio', rotulo: 'Início', icone: 'casa' },
  { para: '/gastos', rotulo: 'Gastos', icone: 'lista' },
  { para: '/planos', rotulo: 'Planos', icone: 'bandeira' },
  { para: '/investir', rotulo: 'Investir', icone: 'grafico' },
  { para: '/feedback', rotulo: 'Conselhos', icone: 'lampada' },
];

function Nav() {
  return (
    <nav className="nav" aria-label="Navegação principal">
      <div className="nav-marca">
        <Logo tamanho={40} />
        <strong>Meus Planos</strong>
      </div>
      {ABAS.map((a) => (
        <NavLink key={a.para} to={a.para} aria-label={a.rotulo} className={({ isActive }) => (isActive ? 'ativo' : '')}>
          {({ isActive }) => (
            <>
              {isActive && <motion.span layoutId="nav-ativo" className="fundo-ativo" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              <Icone nome={a.icone} />
              <span className={isActive ? 'rotulo' : 'rotulo so-computador'}>{a.rotulo}</span>
            </>
          )}
        </NavLink>
      ))}
      <NavLink to="/compra" className={({ isActive }) => `so-computador ${isActive ? 'ativo' : ''}`} aria-label="Antes de comprar">
        <Icone nome="etiqueta" />
        <span className="rotulo">Antes de comprar</span>
      </NavLink>
      <NavLink to="/ajustes" className={({ isActive }) => `so-computador ${isActive ? 'ativo' : ''}`} aria-label="Ajustes">
        <Icone nome="engrenagem" />
        <span className="rotulo">Ajustes</span>
      </NavLink>
    </nav>
  );
}

function AvisoOffline() {
  const online = useOnline();
  return (
    <AnimatePresence>
      {!online && (
        <motion.div className="aviso-offline" role="status" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}>
          <Icone nome="semNuvem" tamanho={18} />
          Sem internet. Tudo continua funcionando.
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Versão nova do app baixada: avisa e deixa a pessoa escolher a hora de atualizar. */
function AvisoAtualizacao() {
  const [nova, setNova] = useState(false);
  useEffect(() => {
    const f = () => setNova(true);
    window.addEventListener('mp-versao-nova', f);
    return () => window.removeEventListener('mp-versao-nova', f);
  }, []);
  return (
    <AnimatePresence>
      {nova && (
        <motion.div className="aviso-versao" role="status" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}>
          <span className="cresce">
            <strong>Nova versão do app</strong>
            <br />
            <span className="mini">Seus dados continuam guardados.</span>
          </span>
          <button type="button" className="botao terracota pequeno" onClick={() => (window as Window & { mpAtualizar?: () => void }).mpAtualizar?.()}>
            Atualizar
          </button>
          <button type="button" className="circulo" aria-label="Depois" onClick={() => setNova(false)}>
            <Icone nome="mais" tamanho={18} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Computador ou tablet deitado: menu lateral fixo. */
function useTelaGrande() {
  const consulta = '(min-width: 900px)';
  const [grande, setGrande] = useState(() => window.matchMedia(consulta).matches);
  useEffect(() => {
    const m = window.matchMedia(consulta);
    const f = () => setGrande(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return grande;
}

export default function App() {
  const { perfil, carregado } = useDados();
  const local = useLocation();
  const bloqueio = useBloqueio();
  const telaGrande = useTelaGrande();

  useEffect(() => {
    const tema = perfil?.tema ?? 'sistema';
    if (tema === 'sistema') document.documentElement.removeAttribute('data-tema');
    else document.documentElement.setAttribute('data-tema', tema);
  }, [perfil?.tema]);

  useEffect(() => {
    if (perfil?.concluiuInicio) avisoDoMes().catch(() => undefined);
  }, [perfil?.concluiuInicio]);

  // App Android: traz os pagamentos lidos das notificações enquanto o app estava fechado.
  useEffect(() => {
    if (perfil?.concluiuInicio) return iniciarLeituraNativa();
  }, [perfil?.concluiuInicio]);

  if (!carregado || !bloqueio.carregado) return null;
  if (perfil?.concluiuInicio && bloqueio.travado && bloqueio.config) {
    return (
      <MotionConfig reducedMotion="user">
        <div className="app">
          <TelaBloqueio config={bloqueio.config} aoDestravar={bloqueio.destravar} />
        </div>
      </MotionConfig>
    );
  }
  const pronto = perfil?.concluiuInicio;
  const comNav = pronto && (ABAS.some((a) => local.pathname === a.para) || telaGrande);
  const chave = local.pathname.split('/').slice(0, 2).join('/') + (local.pathname.split('/')[2] ? '/x' : '');

  return (
    <MotionConfig reducedMotion="user">
      <div className={comNav ? 'app com-menu' : 'app'}>
        <AvisoOffline />
        <AvisoAtualizacao />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={chave}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <Routes location={local}>
              <Route path="/boas-vindas" element={<BoasVindas />} />
              <Route path="/convite" element={<Convite />} />
              {pronto ? (
                <>
                  <Route path="/inicio" element={<Inicio />} />
                  <Route path="/gastos" element={<Gastos />} />
                  <Route path="/importar" element={<Importar />} />
                  <Route path="/planos" element={<Planos />} />
                  <Route path="/planos/novo" element={<NovoPlano />} />
                  <Route path="/planos/:id" element={<PlanoDetalhe />} />
                  <Route path="/planos/:id/editar" element={<NovoPlano />} />
                  <Route path="/investir" element={<Investimentos />} />
                  <Route path="/feedback" element={<Feedback />} />
                  <Route path="/ajustes" element={<Ajustes />} />
                  <Route path="/compra" element={<Compra />} />
                  <Route path="*" element={<Navigate to="/inicio" replace />} />
                </>
              ) : (
                <Route path="*" element={<Navigate to="/boas-vindas" replace />} />
              )}
            </Routes>
          </motion.div>
        </AnimatePresence>
        {comNav && <Nav />}
        {pronto && <PerguntaLocal />}
        {bloqueio.oculto && pronto && <CapaPrivacidade />}
      </div>
    </MotionConfig>
  );
}
