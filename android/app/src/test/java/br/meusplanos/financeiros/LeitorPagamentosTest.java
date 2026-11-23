package br.meusplanos.financeiros;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** Mesmos casos de src/lib/lugar.test.ts, para o leitor nativo e o web darem o mesmo resultado. */
public class LeitorPagamentosTest {
    private static void caso(String titulo, String texto, String tipo, double valor, String local) {
        LeitorPagamentos.Pagamento p = LeitorPagamentos.ler(titulo, texto);
        assertEquals(tipo, p.tipo);
        assertEquals(valor, p.valor, 0.001);
        assertEquals(local, p.local);
    }

    @Test
    public void lugaresIdentificados() {
        caso("Compra aprovada", "Compra de R$ 54,90 APROVADA em IFOOD *IFOOD para o cartão com final 1234.", "saida", 54.9, "Ifood");
        caso("Compra no débito", "Compra no débito de R$ 23,50 em PADARIA PAO QUENTE aprovada", "saida", 23.5, "Padaria Pao Quente");
        caso("Itaú", "Compra aprovada no seu cartão final 1234 - DROGASIL R$ 37,80 em 05/11 às 14:02", "saida", 37.8, "Drogasil");
        caso("Pix enviado", "Você enviou um Pix de R$ 50,00 para Maria Silva", "saida", 50, "Maria Silva");
        caso("Pagamento", "Você pagou R$ 18,40 a Uber", "saida", 18.4, "Uber");
        caso("Compra", "Compra de R$ 120,00 em PG *LOJA DA ANA aprovada", "saida", 120, "Loja da Ana");
        caso("Pix recebido", "Você recebeu um Pix de R$ 1.200,00 de JOAO PEREIRA", "entrada", 1200, "Joao Pereira");
    }

    @Test
    public void semLugarPerguntaParaAPessoa() {
        caso("Compra aprovada", "Compra de R$ 89,90 aprovada no cartão final 4321", "saida", 89.9, null);
        caso("Pix enviado", "Pix de R$ 30,00 enviado com sucesso", "saida", 30, null);
    }

    @Test
    public void ignoraOQueNaoEDinheiro() {
        assertNull(LeitorPagamentos.ler("Ana", "Oi, tudo bem?"));
        assertNull(LeitorPagamentos.ler("Seu código de verificação", "R$ 0,00 código 1234"));
        // Aviso diário de cotação não é pagamento.
        assertNull(LeitorPagamentos.ler("Dólar hoje", "Dólar comercial: compra R$ 5,43 e venda R$ 5,44"));
        assertNull(LeitorPagamentos.ler("Cotação", "Euro fecha a R$ 6,12"));
    }

    @Test
    public void formaDePagamento() {
        assertEquals("credito", LeitorPagamentos.ler("Compra no crédito", "Compra no crédito de R$ 300,00 em LOJA X em 3x aprovada").forma);
        assertEquals(3, LeitorPagamentos.ler("Compra no crédito", "Compra no crédito de R$ 300,00 em LOJA X em 3x aprovada").parcelas);
        assertEquals("debito", LeitorPagamentos.ler("Compra no débito", "Compra no débito de R$ 23,50 em PADARIA aprovada").forma);
        assertEquals("pix", LeitorPagamentos.ler("Pix enviado", "Você enviou um Pix de R$ 50,00 para Maria Silva").forma);
        // Sem dizer: o app pergunta.
        assertNull(LeitorPagamentos.ler("Compra aprovada", "Compra de R$ 89,90 aprovada no cartão final 4321").forma);
        // Compra com o limite disponível no texto continua sendo compra.
        assertEquals(45.0, LeitorPagamentos.ler("Compra aprovada", "Compra de R$ 45,00 aprovada em FARMACIA. Limite disponível R$ 955,00").valor, 0.001);
        // Lembretes de fatura e de limite não são gastos.
        assertNull(LeitorPagamentos.ler("Fatura", "Sua fatura de R$ 800,00 vence amanhã"));
        assertNull(LeitorPagamentos.ler("Limite", "Seu limite disponível agora é R$ 2.000,00"));
    }

    @Test
    public void cotacaoNuncaViraGasto() {
        assertNull(LeitorPagamentos.ler("USD/BRL", "Compra R$ 5,43 · Venda R$ 5,44"));
        assertNull(LeitorPagamentos.ler("Câmbio", "US$ 1 = R$ 5,61"));
        assertNull(LeitorPagamentos.ler("DÓLAR", "R$ 5,72 (+0,8%)"));
        assertNull(LeitorPagamentos.ler("Inter", "O dolar caiu para R$ 5,38 hoje"));
        assertNull(LeitorPagamentos.ler("Do\u0301lar", "Cotac\u0327a\u0303o R$ 5,43"));
        // A palavra "dólar" só numa linha extra do aviso
        assertNull(LeitorPagamentos.ler("Alerta", "Compra: R$ 5,43", "Dólar comercial agora"));
        // Compras de verdade continuam
        assertEquals(110.0, LeitorPagamentos.ler("Compra internacional", "Compra aprovada de R$ 110,00 (US$ 20,00) em AMAZON no cartão final 1234").valor, 0.001);
        assertEquals(600.0, LeitorPagamentos.ler("Bolsa Família", "Depósito de R$ 600,00 caiu na sua conta").valor, 0.001);
    }

    @Test
    public void modeloIgualAoDoApp() {
        // Mesmo valor calculado por modeloDoAviso em src/lib/notificacao.ts (conferido no teste de lá).
        String a = LeitorPagamentos.modelo("Dólar hoje", "Compra R$ 5,43 · Venda R$ 5,44");
        String b = LeitorPagamentos.modelo("Dólar hoje", "Compra R$ 5,61 · Venda R$ 5,62");
        assertEquals(a, b);
        assertEquals(16, a.length());
        assertEquals(MODELO_DOLAR, a);
    }

    static final String MODELO_DOLAR = "cafaef6a8d96848e";
}
