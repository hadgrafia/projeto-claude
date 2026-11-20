package br.meusplanos.financeiros;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import androidx.core.app.RemoteInput;

/** Recebe o nome do lugar digitado direto na notificação. */
public class RespostaLocalReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String id = intent.getStringExtra(Avisos.EXTRA_ID);
        Bundle r = RemoteInput.getResultsFromIntent(intent);
        if (id == null || r == null) return;
        CharSequence texto = r.getCharSequence(Avisos.CHAVE_RESPOSTA);
        String local = texto == null ? "" : texto.toString().trim();
        if (local.isEmpty()) return;
        if (local.length() > 60) local = local.substring(0, 60);
        Armazem.definirLocal(c, id, local);
        Avisos.confirmar(c, id, local);
    }
}
