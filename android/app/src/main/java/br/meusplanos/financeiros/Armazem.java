package br.meusplanos.financeiros;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Iterator;
import java.util.Set;

/**
 * Guarda no aparelho só o essencial de cada pagamento lido (id, horário, valor, tipo,
 * lugar e nome do app) até o app abrir e copiar para o banco local. Nunca guarda o texto
 * da notificação.
 */
final class Armazem {
    private static final String PREFS = "meusplanos_leitor";
    private static final String ITENS = "itens";
    private static final String RECENTES = "recentes";
    private static final long JANELA_DUPLICADO_MS = 3 * 60 * 1000;
    private static final long VALIDADE_MS = 3L * 24 * 60 * 60 * 1000;

    private Armazem() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray itens(Context c) {
        try {
            return new JSONArray(prefs(c).getString(ITENS, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    /** Bancos costumam reenviar/atualizar a mesma notificação: evita contar duas vezes. */
    static synchronized boolean jaVisto(Context c, String assinatura, long agora) {
        try {
            JSONObject rec = new JSONObject(prefs(c).getString(RECENTES, "{}"));
            Iterator<String> it = rec.keys();
            while (it.hasNext()) if (agora - rec.optLong(it.next()) > JANELA_DUPLICADO_MS) it.remove();
            boolean visto = rec.has(assinatura);
            rec.put(assinatura, agora);
            prefs(c).edit().putString(RECENTES, rec.toString()).apply();
            return visto;
        } catch (JSONException e) {
            return false;
        }
    }

    static synchronized void adicionar(Context c, String id, long quando, LeitorPagamentos.Pagamento p, String app, String modelo) {
        try {
            JSONObject o = new JSONObject();
            o.put("id", id);
            o.put("quando", quando);
            o.put("valor", p.valor);
            o.put("tipo", p.tipo);
            if (p.local != null) o.put("local", p.local);
            if (p.forma != null) o.put("forma", p.forma);
            if (p.parcelas > 1) o.put("parcelas", p.parcelas);
            o.put("app", app);
            if (modelo != null && !modelo.isEmpty()) o.put("modelo", modelo);
            JSONArray a = itens(c);
            a.put(o);
            prefs(c).edit().putString(ITENS, a.toString()).apply();
        } catch (JSONException ignored) {
        }
    }

    static synchronized void definirLocal(Context c, String id, String local) {
        JSONArray a = itens(c);
        try {
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                if (id.equals(o.optString("id"))) o.put("local", local);
            }
        } catch (JSONException ignored) {
        }
        prefs(c).edit().putString(ITENS, a.toString()).apply();
    }

    static synchronized JSONArray listar(Context c) {
        JSONArray a = itens(c);
        JSONArray validos = new JSONArray();
        long agora = System.currentTimeMillis();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && agora - o.optLong("quando") < VALIDADE_MS) validos.put(o);
        }
        prefs(c).edit().putString(ITENS, validos.toString()).apply();
        return validos;
    }

    static synchronized void remover(Context c, Set<String> ids) {
        JSONArray a = itens(c);
        JSONArray resto = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && !ids.contains(o.optString("id"))) resto.put(o);
        }
        prefs(c).edit().putString(ITENS, resto.toString()).apply();
    }
}
