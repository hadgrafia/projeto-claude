import { Capacitor } from '@capacitor/core';
import { db, lerCache, salvarCache } from '../db';
import { Leitor } from './nativo';

/**
 * Avisos no celular. No app Android usa a notificação do sistema; no navegador (site e iPhone),
 * a notificação do navegador, quando a pessoa permitir. Respeita a escolha em Ajustes.
 */
export async function pedirPermissaoAvisos(): Promise<boolean> {
  if (Capacitor.getPlatform() === 'android') return (await Leitor.pedirPermissaoAvisos()).avisosPermitidos;
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

export async function avisar(titulo: string, texto: string, chave?: string) {
  const perfil = await db.perfil.get('eu');
  if (!perfil?.avisos?.celular) return;
  // Evita repetir o mesmo aviso.
  if (chave) {
    if (await lerCache(`aviso:${chave}`)) return;
    await salvarCache(`aviso:${chave}`, true);
  }
  try {
    if (Capacitor.getPlatform() === 'android') return void (await Leitor.notificar({ titulo, texto }));
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(titulo, { body: texto, icon: './icon-192.png', badge: './icon-192.png', lang: 'pt-BR' });
    else new Notification(titulo, { body: texto, icon: './icon-192.png' });
  } catch {
    /* sem permissão: ignora */
  }
}

/** Depois de registrar uma compra: avisa se o limite do cartão está quase no fim. */
export async function conferirLimiteCartao() {
  const { estadoCartao } = await import('./cartao');
  const perfil = await db.perfil.get('eu');
  if (!perfil?.limiteCartao) return;
  const e = estadoCartao(perfil, await db.compras.toArray(), await db.movimentos.toArray());
  const livre = e.disponivel;
  const usado = e.uso;
  if (usado >= 0.8)
    await avisar(
      'Limite do cartão quase no fim',
      `Restam ${livre.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })} de limite (${Math.round(usado * 100)}% usado). Evite novas compras no cartão até a fatura baixar.`,
      `limite-${new Date().toISOString().slice(0, 10)}`,
    );
}

/** Uma vez por mês: avisa que o feedback do mês que passou está pronto. */
export async function avisoDoMes() {
  const agora = new Date();
  const anterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  const chave = `${anterior.getFullYear()}-${anterior.getMonth() + 1}`;
  const nome = anterior.toLocaleDateString('pt-BR', { month: 'long' });
  const temGastos = (await db.movimentos.count()) > 0;
  if (temGastos) await avisar(`Seu resumo de ${nome} está pronto`, 'Veja onde dá para economizar e como estão seus planos.', `mes-${chave}`);
}
