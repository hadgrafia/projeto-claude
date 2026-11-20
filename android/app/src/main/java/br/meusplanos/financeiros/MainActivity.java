package br.meusplanos.financeiros;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LeitorNotificacoesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
