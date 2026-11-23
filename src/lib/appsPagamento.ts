import type { Perfil } from '../db';

/**
 * Apps de pagamento que o Meus Planos pode ler. No Android a lista vale para a leitura das
 * notificações; no iPhone e no navegador, para os avisos que chegam pelas automações
 * (Atalhos com a Apple Wallet, MacroDroid). Avisos de outros apps são ignorados.
 */
export const APPS_PADRAO: { pacote?: string; nome: string; carteira?: boolean; icone?: string; sigla?: string; cor?: string }[] = [
  { nome: 'Apple Wallet', carteira: true, icone: 'applepay' },
  { pacote: 'com.samsung.android.spay', nome: 'Samsung Wallet', carteira: true, icone: 'samsungpay' },
  { pacote: 'com.google.android.apps.walletnfcrel', nome: 'Carteira do Google', carteira: true, icone: 'googlepay' },
  { pacote: 'com.nu.production', nome: 'Nubank', icone: 'nubank' },
  { pacote: 'br.com.intermedium', nome: 'Inter', sigla: 'in', cor: '#FF7A00' },
  { pacote: 'com.itau', nome: 'Itaú', sigla: 'itaú', cor: '#EC7000' },
  { pacote: 'com.itau.iti', nome: 'iti', sigla: 'iti', cor: '#E5007E' },
  { pacote: 'com.bradesco', nome: 'Bradesco', sigla: 'B', cor: '#CC092F' },
  { pacote: 'br.com.bb.android', nome: 'Banco do Brasil', sigla: 'BB', cor: '#FCFC30' },
  { pacote: 'com.santander.app', nome: 'Santander', sigla: 'S', cor: '#EC0000' },
  { pacote: 'br.com.gabba.Caixa', nome: 'Caixa', sigla: 'CX', cor: '#005CA9' },
  { pacote: 'com.c6bank.app', nome: 'C6 Bank', sigla: 'C6', cor: '#242424' },
  { pacote: 'com.mercadopago.wallet', nome: 'Mercado Pago', icone: 'mercadopago' },
  { pacote: 'com.picpay', nome: 'PicPay', icone: 'picpay' },
  { pacote: 'com.btg.pactual.banking', nome: 'BTG', sigla: 'btg', cor: '#0B2A5B' },
  { pacote: 'br.com.original.bank', nome: 'Original', sigla: 'O', cor: '#00A651' },
  { pacote: 'com.neon', nome: 'Neon', icone: 'neon' },
  { pacote: 'com.next.app', nome: 'Next', sigla: 'nx', cor: '#00E676' },
  { pacote: 'br.com.uol.ps.myaccount', nome: 'PagBank', icone: 'pagseguro' },
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
