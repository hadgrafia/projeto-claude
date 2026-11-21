package br.meusplanos.financeiros;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LeitorNotificacoesPlugin.class);
        registerPlugin(BiometriaPlugin.class);
        super.onCreate(savedInstanceState);
        // Segurança: bloqueia capturas de tela e esconde o conteúdo na lista de apps recentes.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }
}
