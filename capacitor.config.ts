import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.meusplanos.financeiros',
  appName: 'Meus Planos',
  webDir: 'dist',
  android: { allowMixedContent: false },
};

export default config;
