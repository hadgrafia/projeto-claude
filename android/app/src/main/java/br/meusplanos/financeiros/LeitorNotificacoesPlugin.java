package br.meusplanos.financeiros;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import java.util.Iterator;
import java.util.List;

import java.util.HashSet;
import java.util.Set;

/** Ponte entre o app (src/lib/nativo.ts) e o leitor de notificações do Android. */
@CapacitorPlugin(
    name = "LeitorNotificacoes",
    permissions = { @Permission(alias = "avisos", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class LeitorNotificacoesPlugin extends Plugin {

    private boolean leituraAtiva() {
        return NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName());
    }

    private boolean avisosAtivos() {
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("permitido", leituraAtiva());
        r.put("avisosPermitidos", avisosAtivos());
        call.resolve(r);
    }

    @PluginMethod
    public void abrirPermissao(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void pedirPermissaoAvisos(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("avisos") == PermissionState.GRANTED) {
            JSObject r = new JSObject();
            r.put("avisosPermitidos", avisosAtivos());
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("avisos", call, "aposPedirAvisos");
    }

    @PermissionCallback
    private void aposPedirAvisos(PluginCall call) {
        JSObject r = new JSObject();
        r.put("avisosPermitidos", avisosAtivos());
        call.resolve(r);
    }

    @PluginMethod
    public void pendentes(PluginCall call) {
        JSONArray itens = Armazem.listar(getContext());
        JSObject r = new JSObject();
        try {
            r.put("itens", new JSArray(itens.toString()));
        } catch (JSONException e) {
            r.put("itens", new JSArray());
        }
        call.resolve(r);
    }

    /** Aviso do próprio app (ex.: limite do cartão quase no fim, resumo do mês). */
    @PluginMethod
    public void notificar(PluginCall call) {
        Avisos.avisoGeral(getContext(), call.getString("titulo", "Meus Planos"), call.getString("texto", ""));
        call.resolve();
    }

    /**
     * Apps que podem ser lidos: a lista atual, a padrão, os que mandaram aviso com valor mas
     * estão fora da lista e os apps instalados (para adicionar outro app de pagamento).
     */
    @PluginMethod
    public void apps(PluginCall call) {
        JSObject r = new JSObject();
        r.put("configurado", FiltroApps.configurado(getContext()));
        JSArray permitidos = new JSArray();
        for (String p : FiltroApps.permitidos(getContext())) permitidos.put(p);
        r.put("permitidos", permitidos);
        JSArray padrao = new JSArray();
        for (java.util.Map.Entry<String, String> e : FiltroApps.PADRAO.entrySet()) padrao.put(app(e.getKey(), e.getValue()));
        r.put("padrao", padrao);
        JSArray ignorados = new JSArray();
        JSONObject ig = FiltroApps.ignorados(getContext());
        for (Iterator<String> it = ig.keys(); it.hasNext(); ) {
            String k = it.next();
            ignorados.put(app(k, ig.optString(k, k)));
        }
        r.put("ignorados", ignorados);
        JSArray instalados = new JSArray();
        PackageManager pm = getContext().getPackageManager();
        Intent i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> lista = pm.queryIntentActivities(i, 0);
        Set<String> vistos = new HashSet<>();
        for (ResolveInfo ri : lista) {
            String pacote = ri.activityInfo.packageName;
            if (pacote.equals(getContext().getPackageName()) || !vistos.add(pacote)) continue;
            instalados.put(app(pacote, ri.loadLabel(pm).toString()));
        }
        r.put("instalados", instalados);
        call.resolve(r);
    }

    private static JSObject app(String pacote, String nome) {
        JSObject o = new JSObject();
        o.put("pacote", pacote);
        o.put("nome", nome);
        return o;
    }

    @PluginMethod
    public void definirApps(PluginCall call) {
        JSArray pacotes = call.getArray("pacotes", new JSArray());
        Set<String> set = new HashSet<>();
        for (int i = 0; i < pacotes.length(); i++) {
            String p = pacotes.optString(i, null);
            if (p != null && !p.isEmpty()) set.add(p);
        }
        FiltroApps.definir(getContext(), set);
        call.resolve();
    }

    /** Débito ou crédito automático: memória da conta (por cartão e por banco) e a escolha padrão. */
    @PluginMethod
    public void definirFormas(PluginCall call) {
        com.getcapacitor.JSObject cartoes = call.getObject("cartoes", new com.getcapacitor.JSObject());
        com.getcapacitor.JSObject apps = call.getObject("apps", new com.getcapacitor.JSObject());
        FiltroApps.definirFormas(getContext(), cartoes, apps, call.getString("padrao", "perguntar"));
        call.resolve();
    }

    /** Avisos que a pessoa disse que não eram gasto: os iguais são descartados na hora, sem guardar nada. */
    @PluginMethod
    public void ignorarModelos(PluginCall call) {
        JSArray modelos = call.getArray("modelos", new JSArray());
        Set<String> set = new HashSet<>();
        for (int i = 0; i < modelos.length(); i++) {
            String m = modelos.optString(i, null);
            if (m != null && m.matches("[0-9a-f]{16}")) set.add(m);
        }
        FiltroApps.definirModelosIgnorados(getContext(), set);
        call.resolve();
    }

    /** O app já guardou estes itens com o lugar: apaga daqui e fecha a pergunta, se ainda estiver aberta. */
    @PluginMethod
    public void confirmar(PluginCall call) {
        JSArray ids = call.getArray("ids", new JSArray());
        Set<String> set = new HashSet<>();
        for (int i = 0; i < ids.length(); i++) {
            String id = ids.optString(i, null);
            if (id != null) {
                set.add(id);
                Avisos.cancelar(getContext(), id);
            }
        }
        Armazem.remover(getContext(), set);
        call.resolve();
    }
}
