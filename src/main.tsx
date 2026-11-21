import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

// Guarda o app no aparelho para abrir e funcionar sem internet.
// Quando há versão nova, ela é baixada em segundo plano e o app avisa (nunca recarrega no meio
// do que a pessoa está fazendo). Se ela não tocar em "Atualizar", a versão nova entra sozinha
// na próxima vez que o app for aberto. Os dados ficam no aparelho e não são afetados.
const atualizar = registerSW({
  immediate: true,
  onNeedRefresh: () => window.dispatchEvent(new Event('mp-versao-nova')),
  onRegisteredSW: (_url, reg) => {
    // Procura versão nova a cada hora e sempre que o app volta para a tela.
    if (!reg) return;
    const procurar = () => navigator.onLine && reg.update().catch(() => undefined);
    setInterval(procurar, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && procurar());
  },
});
(window as Window & { mpAtualizar?: () => void }).mpAtualizar = () => atualizar(true);

// Pede ao navegador para não apagar os dados locais quando faltar espaço.
navigator.storage?.persist?.().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
