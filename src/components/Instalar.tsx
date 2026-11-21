import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Icone } from './Icone';

/**
 * Instalação pelo próprio navegador (sem loja, sem APK, sem desligar o Play Protect nem o
 * Bloqueador automático). No Android, o Chrome cria um app de verdade assinado pelo Google
 * (WebAPK): ícone na tela inicial, abre em tela cheia e se atualiza sozinho.
 */
interface PedidoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
type JanelaComPedido = Window & { mpPedidoInstalacao?: PedidoInstalacao };

const instalado = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true || Capacitor.isNativePlatform();
const ehIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const ehAndroid = () => /android/i.test(navigator.userAgent);
const ler = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

/** Guarda o pedido de instalação do navegador (ele chega uma vez só, logo no começo). */
export function prepararInstalacao() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    (window as JanelaComPedido).mpPedidoInstalacao = e as PedidoInstalacao;
    window.dispatchEvent(new Event('mp-pode-instalar'));
  });
  window.addEventListener('appinstalled', () => {
    (window as JanelaComPedido).mpPedidoInstalacao = undefined;
    window.dispatchEvent(new Event('mp-pode-instalar'));
  });
}

function usePedido() {
  const [pedido, setPedido] = useState(() => (window as JanelaComPedido).mpPedidoInstalacao);
  useEffect(() => {
    const f = () => setPedido((window as JanelaComPedido).mpPedidoInstalacao);
    window.addEventListener('mp-pode-instalar', f);
    return () => window.removeEventListener('mp-pode-instalar', f);
  }, []);
  return pedido;
}

/** Botão e instruções de instalação. `compacto`: cartão do Início, que some depois de instalado ou dispensado. */
export function Instalar({ compacto = false }: { compacto?: boolean }) {
  const pedido = usePedido();
  const [dispensado, setDispensado] = useState(() => ler('mp_instalar_dispensado') === '1');
  const [feito, setFeito] = useState(false);
  if (instalado() || feito) return compacto ? null : <p className="pequeno">O app já está instalado neste aparelho.</p>;
  if (compacto && dispensado) return null;

  async function instalar() {
    if (!pedido) return;
    await pedido.prompt();
    const { outcome } = await pedido.userChoice;
    if (outcome === 'accepted') setFeito(true);
  }
  const dispensar = () => {
    try {
      localStorage.setItem('mp_instalar_dispensado', '1');
    } catch {
      /* sem armazenamento */
    }
    setDispensado(true);
  };

  const instrucoes = ehIphone() ? (
    <p className="pequeno">No <strong>Safari</strong>, toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima) e depois em <strong>“Adicionar à Tela de Início”</strong>.</p>
  ) : ehAndroid() ? (
    <p className="pequeno">No <strong>Chrome</strong>, toque no menu <strong>⋮</strong> e em <strong>“Instalar app”</strong> (ou “Adicionar à tela inicial” → “Instalar”).</p>
  ) : (
    <p className="pequeno">No Chrome ou no Edge, clique no ícone de instalar na barra de endereço, ou no menu e em <strong>“Instalar Meus Planos”</strong>.</p>
  );

  const conteudo = (
    <>
      <div className="linha" style={{ alignItems: 'flex-start' }}>
        <span className="circulo terracota"><Icone nome="baixar" /></span>
        <span className="coluna cresce" style={{ gap: 2 }}>
          <strong>Instale o app no seu celular</strong>
          <span className="pequeno suave">É grátis e seguro: instala pelo navegador, sem loja e sem precisar desligar nenhuma proteção do celular.</span>
        </span>
        {compacto && (
          <button type="button" className="circulo" style={{ background: 'transparent', transform: 'rotate(45deg)' }} aria-label="Agora não" onClick={dispensar}>
            <Icone nome="mais" tamanho={18} />
          </button>
        )}
      </div>
      {pedido ? (
        <motion.button type="button" whileTap={{ scale: 0.97 }} className="botao terracota" onClick={instalar}>
          Instalar agora
        </motion.button>
      ) : (
        instrucoes
      )}
    </>
  );
  return compacto ? (
    <motion.section className="cartao" style={{ gridColumn: '1 / -1' }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }}>
      {conteudo}
    </motion.section>
  ) : (
    conteudo
  );
}
