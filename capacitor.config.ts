import type { CapacitorConfig } from '@capacitor/cli';

/**
 * O app Android abre o endereço publicado (protegido pelo Cloudflare Access), para ter
 * o plano em conjunto e a IA. Depois do primeiro acesso, o app fica guardado no celular
 * e abre mesmo sem internet. Os recursos nativos (notificações, biometria) continuam ativos.
 */
const config: CapacitorConfig = {
  appId: 'br.meusplanos.financeiros',
  appName: 'Meus Planos',
  webDir: 'dist',
  server: {
    url: 'https://meus-planos-financeiros.pages.dev',
    // Tela de login por código no e-mail do Cloudflare Access.
    allowNavigation: ['meus-planos-financeiros.pages.dev', '*.cloudflareaccess.com'],
  },
  android: {
    allowMixedContent: false,
    // Android 15+: o app desenha atrás das barras do sistema; isto mantém o conteúdo fora delas.
    adjustMarginsForEdgeToEdge: 'auto',
  },
};

export default config;
