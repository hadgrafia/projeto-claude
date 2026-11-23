package br.meusplanos.financeiros;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lê o texto de uma notificação de qualquer banco ou app de pagamento e extrai
 * valor, tipo (gasto ou entrada) e o nome do lugar. Mesma lógica de src/lib/notificacao.ts
 * e src/lib/lugar.ts. Sem dependências do Android, para poder ser testado sozinho.
 */
public final class LeitorPagamentos {

    public static final class Pagamento {
        public final double valor;
        public final String tipo; // "saida" ou "entrada"
        public final String local; // null quando não deu para descobrir
        public final String forma; // "credito", "debito", "pix", "boleto" ou null (o app pergunta)
        public final int parcelas; // 0 quando não informado

        Pagamento(double valor, String tipo, String local) {
            this(valor, tipo, local, null, 0);
        }

        Pagamento(double valor, String tipo, String local, String forma, int parcelas) {
            this.valor = valor;
            this.tipo = tipo;
            this.local = local;
            this.forma = forma;
            this.parcelas = parcelas;
        }
    }

    private static final int F = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;
    private static final Pattern VALOR = Pattern.compile("R\\$\\s?-?\\s?(\\d{1,3}(?:\\.\\d{3})*(?:,\\d{2})|\\d+(?:,\\d{2})?)", F);

    private static final Pattern[] ENTRADA = compilar(
        "recebeu", "recebido", "recebimento", "dep[oó]sito", "cr[eé]dito em conta", "caiu na (sua )?conta",
        "transfer[eê]ncia recebida", "estorno", "reembolso", "sal[aá]rio");
    private static final Pattern[] SAIDA = compilar(
        "compra", "pagamento", "pago", "paga", "enviad[oa]", "d[eé]bito", "transfer[eê]ncia (realizada|enviada)",
        "saque", "aprovad[ao]", "voc[eê] (pagou|transferiu|enviou)", "pix (enviado|realizado)", "fatura");
    private static final Pattern[] IGNORAR = compilar(
        "c[oó]digo de (verifica|seguran)", "token", "senha", "oferta", "promo", "cashback dispon",
        // Lembretes da fatura não são gastos (as compras já entram uma a uma).
        "fatura (fechou|fechada|vence|venceu|est[aá] (dispon|fechada|aberta)|dispon[ií]vel|do m[eê]s)", "vence (hoje|amanh)",
        // Cotações e mercado: não são pagamentos (ex.: aviso diário do dólar).
        "cota[cç][aã]o", "\\bd[oó]lar(es)?\\b", "\\beuro(s)?\\b", "bitcoin", "\\bbtc\\b", "ibovespa", "c[aâ]mbio", "bolsa de valores", "a[cç][aã]o (subiu|caiu)", "fechou em (alta|queda)");
    /** Aviso só sobre o limite ("seu limite disponível aumentou"). "Compra aprovada… limite disponível" é compra. */
    private static final Pattern SO_LIMITE = Pattern.compile("limite (dispon[ií]vel|do cart[aã]o)", F);
    private static final Pattern TEM_PAGAMENTO = Pattern.compile("compra|aprovad|pagamento|pago|d[eé]bito|pix", F);
    // Forma de pagamento (mesma lógica de formaDoTexto em src/lib/cartao.ts).
    private static final Pattern CREDITO_CONTA = Pattern.compile("cr[eé]dito em conta|cr[eé]dito recebido", F);
    private static final Pattern PAGA_FATURA = Pattern.compile("pagamento (da|de) fatura|fatura paga", F);
    private static final Pattern CREDITO = Pattern.compile("\\bcr[eé]dito\\b", F);
    private static final Pattern DEBITO = Pattern.compile("\\bd[eé]bito\\b", F);
    private static final Pattern PIX = Pattern.compile("\\bpix\\b|\\bted\\b|\\bdoc\\b|transfer[eê]ncia", F);
    private static final Pattern BOLETO = Pattern.compile("\\bboleto\\b", F);
    private static final Pattern VEZES = Pattern.compile("\\b(?:em\\s+)?(\\d{1,2})\\s?x\\b|\\bem\\s+(\\d{1,2})\\s+(?:vezes|parcelas)\\b", F);
    private static final Pattern VOCE_PAGOU = Pattern.compile("voc[eê] (pagou|transferiu|enviou)", F);

    private static final String FIM =
        "(?=\\s+(?:para o|no cart|com final|cart[aã]o|no dia|em \\d|dia \\d|[àa]s \\d|foi|est[aá]|aprovad|realizad|confirmad|no valor|valor|de R\\$|R\\$)|[.,;!\\n]|$)";

    private static final Pattern[] LOCAL_SAIDA = {
        Pattern.compile("\\b(?:em|no estabelecimento|na loja)\\s+(.+?)" + FIM, F),
        Pattern.compile("\\bpara\\s+(?!o cart|seu|sua)(.+?)" + FIM, F),
        Pattern.compile("\\bpagou\\s+R\\$\\s?[\\d.,]+\\s+(?:a|à|ao|para)\\s+(.+?)" + FIM, F),
        Pattern.compile("final \\d{3,4}\\s*[-–:]\\s*(.+?)\\s+R\\$", F),
        Pattern.compile("^(.+?)\\s*[-–:]\\s*R\\$\\s?[\\d.,]+", F),
    };
    private static final Pattern[] LOCAL_ENTRADA = {
        Pattern.compile("R\\$\\s?[\\d.,]+\\s+(?:de|do|da)\\s+(.+?)" + FIM, F),
        Pattern.compile("\\b(?:enviou|transferiu)\\b.*?\\b(?:de|do|da)\\s+(.+?)" + FIM, F),
        Pattern.compile("^(.+?)\\s+(?:te )?(?:enviou|transferiu|pagou)", F),
    };

    private static final Pattern GENERICO_INICIO = Pattern.compile("^(?:seu|sua|seus|suas|um|uma|o seu|a sua|\\d|r\\$)(?:\\s|$)", F);
    private static final Pattern GENERICO_TOTAL = Pattern.compile(
        "^(?:cart[aã]o|conta|d[eé]bito|cr[eé]dito|compra|pagamento|pix|ted|doc|transfer[eê]ncia|boleto|saque|estabelecimento|loja|valor|final|hoje|ontem|gasto|entrada)(?:\\s+\\S+)?$", F);
    private static final Pattern INTERMEDIADOR = Pattern.compile(
        "^(?:pg|pag|mp|mercadopago|mercpago|pagseguro|ps|ebanx|sumup|stone|ton|picpay|ppro|paypal|ec|iz|sq)\\s*\\*\\s*(.+)$", F);
    private static final Set<String> MINUSCULAS = new HashSet<>(Arrays.asList("de", "da", "do", "das", "dos", "e", "em", "a", "o"));
    private static final Locale PT = Locale.forLanguageTag("pt-BR");

    private LeitorPagamentos() {}

    private static Pattern[] compilar(String... r) {
        Pattern[] p = new Pattern[r.length];
        for (int i = 0; i < r.length; i++) p[i] = Pattern.compile(r[i], F);
        return p;
    }

    private static boolean algum(Pattern[] ps, String t) {
        for (Pattern p : ps) if (p.matcher(t).find()) return true;
        return false;
    }

    /** Retorna null quando a notificação não é de pagamento nem de dinheiro recebido. */
    public static Pagamento ler(CharSequence titulo, CharSequence texto) {
        String completo = ((titulo == null ? "" : titulo) + " " + (texto == null ? "" : texto)).trim().replaceAll("\\s+", " ");
        if (completo.isEmpty() || algum(IGNORAR, completo)) return null;
        if (SO_LIMITE.matcher(completo).find() && !TEM_PAGAMENTO.matcher(completo).find()) return null;
        Matcher m = VALOR.matcher(completo);
        if (!m.find()) return null;
        double valor;
        try {
            valor = Double.parseDouble(m.group(1).replace(".", "").replace(",", "."));
        } catch (NumberFormatException e) {
            return null;
        }
        if (valor <= 0) return null;
        boolean entrada = algum(ENTRADA, completo);
        boolean saida = algum(SAIDA, completo);
        if (!entrada && !saida) return null;
        String tipo = entrada && !VOCE_PAGOU.matcher(completo).find() ? "entrada" : "saida";
        if (!"saida".equals(tipo)) return new Pagamento(valor, tipo, extrairLocal(completo, tipo));
        String forma = null;
        if (CREDITO_CONTA.matcher(completo).find()) forma = null;
        else if (PAGA_FATURA.matcher(completo).find()) forma = "debito";
        else if (CREDITO.matcher(completo).find()) forma = "credito";
        else if (DEBITO.matcher(completo).find()) forma = "debito";
        else if (PIX.matcher(completo).find()) forma = "pix";
        else if (BOLETO.matcher(completo).find()) forma = "boleto";
        int parcelas = 0;
        Matcher v = VEZES.matcher(completo);
        if (v.find()) {
            int n = Integer.parseInt(v.group(1) != null ? v.group(1) : v.group(2));
            if (n >= 2 && n <= 48) parcelas = n;
        }
        if (forma == null && parcelas > 0) forma = "credito";
        if (!"credito".equals(forma)) parcelas = 0;
        return new Pagamento(valor, tipo, extrairLocal(completo, tipo), forma, parcelas);
    }

    static String extrairLocal(String texto, String tipo) {
        List<String> candidatos = new ArrayList<>();
        for (Pattern p : "saida".equals(tipo) ? LOCAL_SAIDA : LOCAL_ENTRADA) {
            Matcher m = p.matcher(texto);
            if (m.find() && m.group(1) != null) candidatos.add(m.group(1));
        }
        for (String c : candidatos) {
            String limpo = limparLocal(c);
            if (valido(limpo)) return limpo;
        }
        return null;
    }

    static String limparLocal(String bruto) {
        String s = bruto
            .replaceAll("\\b\\d{2}/\\d{2}(?:/\\d{2,4})?\\b.*$", "")
            .replaceAll("\\b\\d{1,2}:\\d{2}\\b.*$", "")
            .replaceAll("\\*{2,}\\s?\\d{2,4}", "")
            .replaceAll("(?i)\\b(?:final|cart[aã]o)\\s*\\d{3,4}\\b", "")
            .trim();
        Matcher m = INTERMEDIADOR.matcher(s);
        if (m.find()) s = m.group(1);
        String[] partes = s.split("\\*");
        List<String> ok = new ArrayList<>();
        for (String p : partes) if (!p.trim().isEmpty()) ok.add(p.trim());
        if (ok.size() > 1 && normal(ok.get(0)).equals(normal(ok.get(1)))) s = ok.get(0);
        else if (ok.size() > 1) s = String.join(" ", ok);
        s = s.replaceAll("[\\s.,;:\\-–]+$", "").replaceAll("^[\\s\\-–:]+", "").replaceAll("\\s{2,}", " ").trim();
        if (s.isEmpty()) return "";
        if (s.equals(s.toUpperCase(PT)) && s.matches(".*[A-Z].*")) {
            String[] w = s.toLowerCase(PT).split(" ");
            StringBuilder b = new StringBuilder();
            for (int i = 0; i < w.length; i++) {
                if (i > 0) b.append(' ');
                if (i > 0 && MINUSCULAS.contains(w[i])) b.append(w[i]);
                else if (!w[i].isEmpty()) b.append(Character.toUpperCase(w[i].charAt(0))).append(w[i].substring(1));
            }
            s = b.toString();
        }
        return s.length() > 60 ? s.substring(0, 60) : s;
    }

    private static String normal(String s) {
        return s.toLowerCase(PT).replaceAll("\\W", "");
    }

    static boolean valido(String s) {
        if (s == null) return false;
        String t = s.trim();
        return t.length() >= 2
            && !GENERICO_INICIO.matcher(t).find()
            && !GENERICO_TOTAL.matcher(t).matches()
            && t.matches("(?s).*[A-Za-zÀ-ú].*");
    }
}
