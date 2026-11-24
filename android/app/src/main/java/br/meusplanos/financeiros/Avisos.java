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

import org.json.JSONObject;

import java.text.NumberFormat;
import java.util.Locale;

/** Notificações que perguntam o que faltou no aviso do banco (lugar, débito ou crédito, parcelas), com resposta direto nela. */
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
            NotificationChannel canal = new NotificationChannel(CANAL, "Perguntas sobre gastos", NotificationManager.IMPORTANCE_HIGH);
            canal.setDescription("Pergunta o lugar, se foi débito ou crédito e em quantas vezes, quando o aviso do banco não informa.");
            c.getSystemService(NotificationManager.class).createNotificationChannel(canal);
        }
    }

    static final String EXTRA_ACAO = "acao";
    static final String EXTRA_VALOR = "valor";
    static final String CHAVE_VEZES = "vezes";

    private static PendingIntent acao(Context c, String id, int n, String acao, String valor, boolean comResposta) {
        Intent i = new Intent(c, RespostaLocalReceiver.class).putExtra(EXTRA_ID, id).putExtra(EXTRA_ACAO, acao);
        if (valor != null) i.putExtra(EXTRA_VALOR, valor);
        // Com campo de resposta, o sistema precisa preencher o texto (mutável); botões simples ficam imutáveis.
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (comResposta ? (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0) : PendingIntent.FLAG_IMMUTABLE);
        return PendingIntent.getBroadcast(c, idNotificacao(id) * 31 + n, i, flags);
    }

    private static NotificationCompat.Action botao(Context c, String id, int n, String rotulo, String acao, String valor) {
        return new NotificationCompat.Action.Builder(R.mipmap.ic_launcher, rotulo, acao(c, id, n, acao, valor, false)).build();
    }

    private static NotificationCompat.Action resposta(Context c, String id, int n, String rotulo, String chave, String dica, String acao) {
        RemoteInput r = new RemoteInput.Builder(chave).setLabel(dica).build();
        return new NotificationCompat.Action.Builder(R.mipmap.ic_launcher, rotulo, acao(c, id, n, acao, null, true))
            .addRemoteInput(r)
            .setAllowGeneratedReplies(false)
            .build();
    }

    /**
     * Pergunta, direto na notificação (sem abrir o app), o que faltou no aviso do banco, um passo por vez:
     *  1) débito ou crédito? (com o campo do lugar junto, se ele também faltar)
     *  2) no crédito: à vista ou em quantas vezes?
     *  3) onde foi? (se ainda faltar)
     * Quando não falta mais nada, mostra "Anotado" e some sozinha.
     */
    static void perguntar(Context c, String id) {
        JSONObject o = Armazem.obter(c, id);
        if (o == null) return;
        criarCanal(c);
        String valor = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("pt-BR")).format(o.optDouble("valor"));
        boolean entrada = "entrada".equals(o.optString("tipo"));
        String local = o.optString("local", "");
        String forma = o.optString("forma", "");
        String app = o.optString("app", "banco");
        boolean semLocal = local.isEmpty();

        NotificationCompat.Builder b = base(c, id);
        if (!entrada && forma.isEmpty()) {
            String cartao = o.optString("cartao", "");
            b.setContentTitle("Compra de " + valor + (semLocal ? "" : " em " + local) + ": débito ou crédito?")
                .setContentText((cartao.isEmpty() ? "Aviso do " + app : "Cartão final " + cartao) + ". Responda uma vez: as próximas compras " + (cartao.isEmpty() ? "deste banco" : "deste cartão") + " entram sozinhas.")
                .addAction(botao(c, id, 1, "Débito", "forma", "debito"))
                .addAction(botao(c, id, 2, "Crédito", "forma", "credito"));
            if (semLocal) b.addAction(resposta(c, id, 3, "Onde foi?", CHAVE_RESPOSTA, "Nome da loja ou lugar", "local"));
            else b.addAction(resposta(c, id, 6, "Parcelado", CHAVE_VEZES, "Crédito em quantas vezes? (ex.: 3)", "vezes"));
        } else if (!entrada && o.optBoolean("perguntarVezes")) {
            b.setContentTitle("Crédito: " + valor + (semLocal ? "" : " em " + local) + " em quantas vezes?")
                .setContentText("Toque em À vista ou responda com o número de parcelas (ex.: 3).")
                .addAction(botao(c, id, 5, "À vista", "vezes", "1"))
                .addAction(resposta(c, id, 6, "Parcelado", CHAVE_VEZES, "Em quantas vezes? (ex.: 3)", "vezes"));
        } else if (semLocal) {
            b.setContentTitle(entrada ? "De onde veio " + valor + "?" : "Onde foi este gasto de " + valor + "?")
                .setContentText("Aviso do " + app + ". Responda com o nome " + (entrada ? "de quem enviou." : "da loja ou lugar."))
                .addAction(resposta(c, id, 3, "Informar lugar", CHAVE_RESPOSTA, entrada ? "De quem ou de onde veio?" : "Nome da loja ou lugar", "local"));
        } else {
            String resumo = local + (forma.isEmpty() ? "" : " · " + nomeForma(forma, o.optInt("parcelas", 0)));
            confirmar(c, id, resumo);
            return;
        }
        try {
            NotificationManagerCompat.from(c).notify(idNotificacao(id), b.build());
        } catch (SecurityException semPermissao) {
            // Sem permissão de avisos: o app pergunta quando for aberto.
        }
    }

    static String nomeForma(String forma, int parcelas) {
        switch (forma) {
            case "credito": return parcelas > 1 ? "crédito em " + parcelas + "x" : "crédito à vista";
            case "debito": return "débito";
            case "pix": return "Pix";
            case "boleto": return "boleto";
            default: return forma;
        }
    }

    private static NotificationCompat.Builder base(Context c, String id) {
        Intent abrir = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent aoTocar = PendingIntent.getActivity(c, 0, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(c, CANAL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .setContentIntent(aoTocar);
    }

    /** Depois da resposta, troca a notificação por uma confirmação que some sozinha. */
    static void confirmar(Context c, String id, String texto) {
        criarCanal(c);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CANAL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Anotado: " + texto)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setTimeoutAfter(4000)
            .setAutoCancel(true);
        try {
            NotificationManagerCompat.from(c).notify(idNotificacao(id), b.build());
        } catch (SecurityException ignored) {
        }
    }

    static final String CANAL_GERAL = "avisos";

    static void avisoGeral(Context c, String titulo, String texto) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel canal = new NotificationChannel(CANAL_GERAL, "Avisos do app", NotificationManager.IMPORTANCE_DEFAULT);
            canal.setDescription("Limite do cartão, parcelas e resumo do mês.");
            c.getSystemService(NotificationManager.class).createNotificationChannel(canal);
        }
        Intent abrir = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent aoTocar = PendingIntent.getActivity(c, 1, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CANAL_GERAL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
            .setContentIntent(aoTocar)
            .setAutoCancel(true);
        try {
            NotificationManagerCompat.from(c).notify((titulo + texto).hashCode(), b.build());
        } catch (SecurityException ignored) {
        }
    }

    static void cancelar(Context c, String id) {
        NotificationManagerCompat.from(c).cancel(idNotificacao(id));
    }
}
