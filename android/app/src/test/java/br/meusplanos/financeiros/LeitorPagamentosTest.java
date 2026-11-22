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
}
