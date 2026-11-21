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
