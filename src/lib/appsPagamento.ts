import type { Perfil } from '../db';

/**
 * Apps de pagamento que o Meus Planos pode ler. No Android a lista vale para a leitura das
 * notificações; no iPhone e no navegador, para os avisos que chegam pelas automações
 * (Atalhos com a Apple Wallet, MacroDroid). Avisos de outros apps são ignorados.
 */
export const APPS_PADRAO: { pacote?: string; nome: string; carteira?: boolean }[] = [
  { nome: 'Apple Wallet', carteira: true },
  { pacote: 'com.samsung.android.spay', nome: 'Samsung Wallet', carteira: true },
  { pacote: 'com.google.android.apps.walletnfcrel', nome: 'Carteira do Google', carteira: true },
  { pacote: 'com.nu.production', nome: 'Nubank' },
  { pacote: 'br.com.intermedium', nome: 'Inter' },
  { pacote: 'com.itau', nome: 'Itaú' },
  { pacote: 'com.itau.iti', nome: 'iti' },
  { pacote: 'com.bradesco', nome: 'Bradesco' },
  { pacote: 'br.com.bb.android', nome: 'Banco do Brasil' },
  { pacote: 'com.santander.app', nome: 'Santander' },
  { pacote: 'br.com.gabba.Caixa', nome: 'Caixa' },
  { pacote: 'com.c6bank.app', nome: 'C6 Bank' },
  { pacote: 'com.mercadopago.wallet', nome: 'Mercado Pago' },
  { pacote: 'com.picpay', nome: 'PicPay' },
  { pacote: 'com.btg.pactual.banking', nome: 'BTG' },
  { pacote: 'br.com.original.bank', nome: 'Original' },
  { pacote: 'com.neon', nome: 'Neon' },
  { pacote: 'com.next.app', nome: 'Next' },
  { pacote: 'br.com.uol.ps.myaccount', nome: 'PagBank' },
];

/** Nada vem marcado: cada pessoa escolhe os apps que usa (no cadastro ou em Ajustes). */
export const listaDeApps = (perfil?: Perfil) => perfil?.appsPagamento ?? [];
export const escolheuApps = (perfil?: Perfil) => (perfil?.appsPagamento?.length ?? 0) > 0;

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** O aviso veio de um app da lista? (compara pelo nome, para as automações) */
export function appPermitido(perfil: Perfil | undefined, nomeDoApp: string) {
  const n = normal(nomeDoApp);
  if (!n) return false;
  return listaDeApps(perfil).some((a) => {
    const m = normal(a.nome);
    return m === n || n.includes(m) || m.includes(n) || (a.pacote ? normal(a.pacote).includes(n) : false);
  });
}
