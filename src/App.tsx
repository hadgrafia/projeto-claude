import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { useEffect } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Icone, type NomeIcone } from './components/Icone';
import { useDados, useOnline } from './hooks';
import Ajustes from './pages/Ajustes';
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
  { para: '/feedback', rotulo: 'Feedback', icone: 'lampada' },
];

function Nav() {
  return (
    <nav className="nav" aria-label="Navegação principal">
      {ABAS.map((a) => (
        <NavLink key={a.para} to={a.para} aria-label={a.rotulo} className={({ isActive }) => (isActive ? 'ativo' : '')}>
          {({ isActive }) => (
            <>
              {isActive && <motion.span layoutId="nav-ativo" className="fundo-ativo" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              <Icone nome={a.icone} />
              {isActive && <span>{a.rotulo}</span>}
            </>
          )}
        </NavLink>
      ))}
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

export default function App() {
  const { perfil, carregado } = useDados();
  const local = useLocation();

  useEffect(() => {
    const tema = perfil?.tema ?? 'sistema';
    if (tema === 'sistema') document.documentElement.removeAttribute('data-tema');
    else document.documentElement.setAttribute('data-tema', tema);
  }, [perfil?.tema]);

  if (!carregado) return null;
  const pronto = perfil?.concluiuInicio;
  const comNav = pronto && ABAS.some((a) => local.pathname === a.para);
  const chave = local.pathname.split('/').slice(0, 2).join('/') + (local.pathname.split('/')[2] ? '/x' : '');

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <AvisoOffline />
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
                  <Route path="*" element={<Navigate to="/inicio" replace />} />
                </>
              ) : (
                <Route path="*" element={<Navigate to="/boas-vindas" replace />} />
              )}
            </Routes>
          </motion.div>
        </AnimatePresence>
        {comNav && <Nav />}
      </div>
    </MotionConfig>
  );
}
