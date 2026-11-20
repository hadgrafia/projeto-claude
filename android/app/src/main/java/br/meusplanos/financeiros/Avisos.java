package br.meusplanos.financeiros;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;

import java.text.NumberFormat;
import java.util.Locale;

/** Notificação "Onde foi este gasto?" com campo para responder sem abrir o app. */
final class Avisos {
    static final String CANAL = "pergunta_local";
    static final String CHAVE_RESPOSTA = "local";
    static final String EXTRA_ID = "id";

    private Avisos() {}

    static int idNotificacao(String id) {
        return id.hashCode();
    }

    private static void criarCanal(Context c) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel canal = new NotificationChannel(CANAL, "Onde foi este gasto?", NotificationManager.IMPORTANCE_HIGH);
            canal.setDescription("Pergunta o nome da loja ou lugar quando o aviso do banco não informa.");
            c.getSystemService(NotificationManager.class).createNotificationChannel(canal);
        }
    }

    static void perguntarLocal(Context c, String id, LeitorPagamentos.Pagamento p, String app) {
        criarCanal(c);
        String valor = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("pt-BR")).format(p.valor);
        boolean entrada = "entrada".equals(p.tipo);

        RemoteInput resposta = new RemoteInput.Builder(CHAVE_RESPOSTA)
            .setLabel(entrada ? "De quem ou de onde veio?" : "Nome da loja ou lugar")
            .build();
        Intent i = new Intent(c, RespostaLocalReceiver.class).putExtra(EXTRA_ID, id);
        int flagsResposta = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
        PendingIntent aoResponder = PendingIntent.getBroadcast(c, idNotificacao(id), i, flagsResposta);
        NotificationCompat.Action acao = new NotificationCompat.Action.Builder(R.mipmap.ic_launcher, "Informar lugar", aoResponder)
            .addRemoteInput(resposta)
            .setAllowGeneratedReplies(false)
            .build();

        Intent abrir = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent aoTocar = PendingIntent.getActivity(c, 0, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CANAL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(entrada ? "De onde veio " + valor + "?" : "Onde foi este gasto de " + valor + "?")
            .setContentText("Aviso do " + app + ". Responda com o nome " + (entrada ? "de quem enviou." : "da loja ou lugar."))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(aoTocar)
            .addAction(acao);
        try {
            NotificationManagerCompat.from(c).notify(idNotificacao(id), b.build());
        } catch (SecurityException semPermissao) {
            // Sem permissão de avisos: o app pergunta quando for aberto.
        }
    }

    /** Depois da resposta, troca a notificação por uma confirmação que some sozinha. */
    static void confirmar(Context c, String id, String local) {
        criarCanal(c);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CANAL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Anotado: " + local)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setTimeoutAfter(4000)
            .setAutoCancel(true);
        try {
            NotificationManagerCompat.from(c).notify(idNotificacao(id), b.build());
        } catch (SecurityException ignored) {
        }
    }

    static void cancelar(Context c, String id) {
        NotificationManagerCompat.from(c).cancel(idNotificacao(id));
    }
}
