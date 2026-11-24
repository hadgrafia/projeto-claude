package br.meusplanos.financeiros;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import androidx.core.app.RemoteInput;

/** Recebe as respostas dadas direto na notificação: lugar, débito ou crédito e número de parcelas. */
public class RespostaLocalReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String id = intent.getStringExtra(Avisos.EXTRA_ID);
        if (id == null) return;
        String acao = intent.getStringExtra(Avisos.EXTRA_ACAO);
        String valor = intent.getStringExtra(Avisos.EXTRA_VALOR);
        Bundle r = RemoteInput.getResultsFromIntent(intent);

        if ("forma".equals(acao) && valor != null && valor.matches("debito|credito|pix")) {
            // Crédito = à vista (parcelado tem o botão próprio). Aprende para as próximas compras.
            Armazem.definirForma(c, id, valor, 0, false);
            aprender(c, id, valor);
        } else if ("vezes".equals(acao)) {
            String txt = valor;
            if (txt == null && r != null) {
                CharSequence v = r.getCharSequence(Avisos.CHAVE_VEZES);
                txt = v == null ? "" : v.toString();
            }
            int n;
            try {
                n = Integer.parseInt(txt == null ? "" : txt.replaceAll("\\D", ""));
            } catch (NumberFormatException e) {
                n = 0;
            }
            if (n < 1 || n > 48) {
                Avisos.perguntar(c, id); // resposta inválida: pergunta de novo
                return;
            }
            Armazem.definirForma(c, id, "credito", n, false);
            aprender(c, id, "credito");
        } else {
            // "local" (também o formato das versões anteriores, sem ação).
            if (r == null) return;
            CharSequence texto = r.getCharSequence(Avisos.CHAVE_RESPOSTA);
            String local = texto == null ? "" : texto.toString().trim();
            if (local.isEmpty()) return;
            if (local.length() > 60) local = local.substring(0, 60);
            Armazem.definirLocal(c, id, local);
        }
        Avisos.perguntar(c, id);
    }

    /** Lembra a resposta para este cartão (se o aviso mostrou o final) ou para este banco. */
    private static void aprender(Context c, String id, String forma) {
        org.json.JSONObject o = Armazem.obter(c, id);
        if (o == null) return;
        FiltroApps.aprenderForma(c, o.optString("cartao", ""), o.optString("app", ""), forma);
        Armazem.marcarAprendida(c, id);
    }
}
