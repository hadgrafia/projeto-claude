package br.meusplanos.financeiros;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Quais apps o Meus Planos pode ler. Só avisos desses apps viram lançamentos; o resto
 * (cotação do dólar, notícias, redes sociais…) é ignorado na hora.
 * Enquanto a pessoa não escolhe, nenhum app é lido. PADRAO é só a lista de opções sugeridas.
 * Apps fora da lista que mandaram aviso com valor ficam anotados (só pacote e nome) para a
 * pessoa poder adicioná-los em Ajustes.
 */
final class FiltroApps {
    private static final String PREFS = "meusplanos_filtro";

    /** Lista padrão: carteiras de pagamento por aproximação e bancos/apps de pagamento conhecidos. */
    static final Map<String, String> PADRAO = new LinkedHashMap<>();
    static {
        PADRAO.put("com.samsung.android.spay", "Samsung Wallet");
        PADRAO.put("com.google.android.apps.walletnfcrel", "Carteira do Google");
        PADRAO.put("com.nu.production", "Nubank");
        PADRAO.put("br.com.intermedium", "Inter");
        PADRAO.put("com.itau", "Itaú");
        PADRAO.put("com.itau.iti", "iti");
        PADRAO.put("com.bradesco", "Bradesco");
        PADRAO.put("br.com.bb.android", "Banco do Brasil");
        PADRAO.put("com.santander.app", "Santander");
        PADRAO.put("br.com.gabba.Caixa", "Caixa");
        PADRAO.put("com.c6bank.app", "C6 Bank");
        PADRAO.put("com.mercadopago.wallet", "Mercado Pago");
        PADRAO.put("com.picpay", "PicPay");
        PADRAO.put("com.btg.pactual.banking", "BTG");
        PADRAO.put("br.com.original.bank", "Original");
        PADRAO.put("com.neon", "Neon");
        PADRAO.put("com.next.app", "Next");
        PADRAO.put("br.com.uol.ps.myaccount", "PagBank");
    }

    private FiltroApps() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean configurado(Context c) {
        return prefs(c).contains("permitidos");
    }

    static Set<String> permitidos(Context c) {
        // Enquanto a pessoa não escolhe os apps que usa, nada é lido (só anotado como sugestão).
        if (!configurado(c)) return new HashSet<>();
        Set<String> s = new HashSet<>();
        try {
            JSONArray a = new JSONArray(prefs(c).getString("permitidos", "[]"));
            for (int i = 0; i < a.length(); i++) s.add(a.getString(i));
        } catch (JSONException e) {
            return new HashSet<>();
        }
        return s;
    }

    static boolean permitido(Context c, String pacote) {
        return permitidos(c).contains(pacote);
    }

    static synchronized void definir(Context c, Set<String> pacotes) {
        prefs(c).edit().putString("permitidos", new JSONArray(pacotes).toString()).apply();
    }

    /** App fora da lista mandou um aviso com valor: anota (pacote e nome) como sugestão. */
    static synchronized void anotarIgnorado(Context c, String pacote, String nome) {
        try {
            JSONObject o = new JSONObject(prefs(c).getString("ignorados", "{}"));
            o.put(pacote, nome);
            // Guarda só os 30 mais recentes.
            while (o.length() > 30) {
                Iterator<String> it = o.keys();
                o.remove(it.next());
            }
            prefs(c).edit().putString("ignorados", o.toString()).apply();
        } catch (JSONException ignored) {
        }
    }

    static JSONObject ignorados(Context c) {
        try {
            return new JSONObject(prefs(c).getString("ignorados", "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

}
