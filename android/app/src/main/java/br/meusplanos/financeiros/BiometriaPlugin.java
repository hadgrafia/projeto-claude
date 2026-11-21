package br.meusplanos.financeiros;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Desbloqueio com digital ou rosto usando a tela de biometria do próprio Android.
 * O resultado só diz "ok" ou não: o app nunca recebe dados biométricos.
 */
@CapacitorPlugin(name = "Biometria")
public class BiometriaPlugin extends Plugin {
    private static final int AUTENTICADORES = BiometricManager.Authenticators.BIOMETRIC_WEAK;

    @PluginMethod
    public void disponivel(PluginCall call) {
        int r = BiometricManager.from(getContext()).canAuthenticate(AUTENTICADORES);
        JSObject o = new JSObject();
        o.put("disponivel", r == BiometricManager.BIOMETRIC_SUCCESS);
        if (r == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) o.put("motivo", "Nenhuma digital ou rosto cadastrado no celular.");
        else if (r != BiometricManager.BIOMETRIC_SUCCESS) o.put("motivo", "Este celular não tem biometria disponível.");
        call.resolve(o);
    }

    @PluginMethod
    public void autenticar(PluginCall call) {
        String titulo = call.getString("titulo", "Meus Planos");
        String subtitulo = call.getString("subtitulo", "Desbloqueie para continuar");
        FragmentActivity atividade = getActivity();
        atividade.runOnUiThread(() -> {
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(titulo)
                .setSubtitle(subtitulo)
                .setNegativeButtonText("Usar senha do app")
                .setAllowedAuthenticators(AUTENTICADORES)
                .setConfirmationRequired(false)
                .build();
            BiometricPrompt prompt = new BiometricPrompt(atividade, ContextCompat.getMainExecutor(getContext()),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        JSObject o = new JSObject();
                        o.put("ok", true);
                        call.resolve(o);
                    }

                    @Override
                    public void onAuthenticationError(int codigo, @NonNull CharSequence mensagem) {
                        JSObject o = new JSObject();
                        o.put("ok", false);
                        o.put("mensagem", mensagem.toString());
                        call.resolve(o);
                    }
                    // onAuthenticationFailed: tentativa não reconhecida; o próprio sistema deixa tentar de novo.
                });
            prompt.authenticate(info);
        });
    }
}
