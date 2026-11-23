package br.meusplanos.financeiros;

import android.app.Notification;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Escuta as notificações do celular. Só avisos com valor em R$ de pagamento ou de
 * dinheiro recebido são aproveitados; todo o resto é ignorado na hora e nada é guardado.
 * O app NUNCA abre nem acessa o app do banco.
 */
public class ServicoNotificacoes extends NotificationListenerService {

    private static final Map<String, String> NOMES = new HashMap<>();
    static {
        NOMES.put("com.nu.production", "Nubank");
        NOMES.put("br.com.intermedium", "Inter");
        NOMES.put("com.itau", "Itaú");
        NOMES.put("com.bradesco", "Bradesco");
        NOMES.put("br.com.bb.android", "Banco do Brasil");
        NOMES.put("com.santander.app", "Santander");
        NOMES.put("br.com.gabba.Caixa", "Caixa");
        NOMES.put("com.c6bank.app", "C6 Bank");
        NOMES.put("com.mercadopago.wallet", "Mercado Pago");
        NOMES.put("com.picpay", "PicPay");
        NOMES.put("com.btg.pactual.banking", "BTG");
        NOMES.put("br.com.original.bank", "Original");
        NOMES.put("com.neon", "Neon");
        NOMES.put("com.next.app", "Next");
        NOMES.put("br.com.uol.ps.myaccount", "PagBank");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || getPackageName().equals(sbn.getPackageName())) return;
        Notification n = sbn.getNotification();
        if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle ex = n.extras;
        if (ex == null) return;
        CharSequence titulo = ex.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence texto = ex.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (texto == null) texto = ex.getCharSequence(Notification.EXTRA_TEXT);

        // Outras linhas do aviso (subtítulo, resumo, linhas extras): às vezes a palavra "dólar"
        // ou "cotação" está só nelas. Servem só para reconhecer o que NÃO é pagamento.
        StringBuilder resto = new StringBuilder();
        for (String k : new String[] {Notification.EXTRA_TEXT, Notification.EXTRA_SUB_TEXT, Notification.EXTRA_SUMMARY_TEXT, Notification.EXTRA_INFO_TEXT, Notification.EXTRA_TITLE_BIG}) {
            CharSequence v = ex.getCharSequence(k);
            if (v != null) resto.append(' ').append(v);
        }
        CharSequence[] linhas = ex.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (linhas != null) for (CharSequence l : linhas) if (l != null) resto.append(' ').append(l);
        if (n.tickerText != null) resto.append(' ').append(n.tickerText);

        LeitorPagamentos.Pagamento p = LeitorPagamentos.ler(titulo, texto, resto);
        if (p == null) return;
        // A pessoa já disse que avisos iguais a este não eram gasto (ex.: cotação diária).
        String modelo = LeitorPagamentos.modelo(titulo, texto);
        if (FiltroApps.modeloIgnorado(this, modelo)) return;
        // Só os apps escolhidos (carteiras e bancos). Outros ficam anotados como sugestão.
        if (!FiltroApps.permitido(this, sbn.getPackageName())) {
            FiltroApps.anotarIgnorado(this, sbn.getPackageName(), nomeDoApp(sbn.getPackageName(), ex));
            return;
        }

        long agora = System.currentTimeMillis();
        String assinatura = sbn.getPackageName() + "|" + p.valor + "|" + p.tipo + "|" + (String.valueOf(titulo) + texto).hashCode();
        if (Armazem.jaVisto(this, assinatura, agora)) return;

        String app = nomeDoApp(sbn.getPackageName(), ex);
        String id = UUID.randomUUID().toString();
        Armazem.adicionar(this, id, agora, p, app, modelo);
        // Faltou o lugar ou (num gasto) se foi débito ou crédito: pergunta na própria notificação.
        if (p.local == null || ("saida".equals(p.tipo) && p.forma == null)) Avisos.perguntar(this, id);
    }

    private String nomeDoApp(String pacote, Bundle ex) {
        if (NOMES.containsKey(pacote)) return NOMES.get(pacote);
        if (FiltroApps.PADRAO.containsKey(pacote)) return FiltroApps.PADRAO.get(pacote);
        try {
            Object info = ex.get("android.appInfo");
            PackageManager pm = getPackageManager();
            if (info instanceof ApplicationInfo) return pm.getApplicationLabel((ApplicationInfo) info).toString();
            return pm.getApplicationLabel(pm.getApplicationInfo(pacote, 0)).toString();
        } catch (Exception e) {
            return "app de pagamento";
        }
    }
}
