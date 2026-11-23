import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import { Entra } from '../components/Ui';
import { FormMovimento } from './Gastos';
import { guardarArquivoParaImportar, lerComprovante, lerParametros, pegarCompartilhado, type Lido } from '../lib/compartilhar';
import { linhasDoPDF, lerLinhasExtrato } from '../lib/importar';
import { dataCurta, reais } from '../lib/format';
import { db, type Movimento } from '../db';
import { jaRegistrado } from '../lib/conciliar';
import { appPermitido } from '../lib/appsPagamento';

/**
 * Lançamento rápido: chega por "Compartilhar comprovante" ou por um link de automação.
 * Mostra o que foi lido e a pessoa confirma (ou corrige) antes de salvar.
 */
export default function Lancar() {
  const local = useLocation();
  const navegar = useNavigate();
  const [lido, setLido] = useState<Lido | null>();
  const [aviso, setAviso] = useState('');
  const [parecido, setParecido] = useState<Movimento>();

  // Mesma compra já registrada (aviso repetido, comprovante compartilhado duas vezes, extrato)?
  useEffect(() => {
    if (!lido?.valor) return;
    const agora = Date.now();
    db.movimentos
      .where('data')
      .between(new Date(agora - 4 * 864e5).toISOString(), new Date(agora + 864e5).toISOString(), true, true)
      .toArray()
      .then((lista) => setParecido(jaRegistrado({ valor: lido.valor!, tipo: lido.tipo, data: new Date().toISOString(), local: lido.local }, lista)));
  }, [lido]);

  useEffect(() => {
    const p = new URLSearchParams(local.search);
    (async () => {
      if (p.get('compartilhado') !== '1') {
        // Aviso de um app fora da lista de apps de pagamento (ex.: cotação do dólar): ignora.
        const app = p.get('app') ?? '';
        const perfil = await db.perfil.get('eu');
        if (app && (p.get('texto') || p.get('titulo')) && !appPermitido(perfil, app)) {
          setAviso(`O aviso veio de "${app}", que não está na sua lista de apps de pagamento (Ajustes). Nada foi preenchido.`);
          return setLido(null);
        }
        return setLido(lerParametros(p));
      }
      const c = await pegarCompartilhado();
      if (!c) return setLido(null);
      const a = c.arquivo;
      if (a && /\.(ofx|csv)$/i.test(a.name)) {
        guardarArquivoParaImportar(a);
        return navegar('/importar', { replace: true });
      }
      let texto = `${c.titulo}\n${c.texto}`;
      if (a && (a.type === 'application/pdf' || /\.pdf$/i.test(a.name))) {
        const linhas = await linhasDoPDF(await a.arrayBuffer());
        // Muitos lançamentos: é um extrato, não um comprovante.
        if (lerLinhasExtrato(linhas).length >= 3) {
          guardarArquivoParaImportar(a);
          return navegar('/importar', { replace: true });
        }
        texto = `${texto}\n${linhas.join('\n')}`;
      } else if (a && a.type.startsWith('text/')) texto = `${texto}\n${await a.text()}`;
      else if (a) setAviso('Este tipo de arquivo (imagem) não dá para ler aqui. Compartilhe o comprovante em PDF ou como texto, ou preencha abaixo.');
      setLido(lerComprovante(texto) ?? lerParametros(new URLSearchParams({ texto })));
    })().catch(() => setLido(null));
  }, [local.search, navegar]);

  if (lido === undefined) return <main className="tela sem-nav"><p className="vazio">Lendo…</p></main>;

  return (
    <main className="tela sem-nav">
      <div className="topo">
        <div className="linha">
          <button type="button" className="circulo escuro" aria-label="Voltar" onClick={() => navegar('/gastos', { replace: true })}><Icone nome="voltar" /></button>
          <h1 className="titulo" style={{ fontSize: 24 }}>Novo lançamento</h1>
        </div>
      </div>
      <Entra>
        <section className="cartao verde">
          {lido?.valor ? (
            <span className="pequeno">
              Encontrei <strong>{reais(lido.valor)}</strong>
              {lido.local ? <> em <strong>{lido.local}</strong></> : ''}
              {lido.origemTexto ? <> (aviso do {lido.origemTexto})</> : ''}. Confira e toque em Salvar.
            </span>
          ) : (
            <span className="pequeno">Não consegui ler o valor automaticamente. Preencha abaixo: leva segundos.</span>
          )}
        </section>
      </Entra>
      {aviso && <p className="cartao areia pequeno">{aviso}</p>}
      {parecido && (
        <p className="cartao areia pequeno">
          Parece que esta compra já foi registrada: {reais(parecido.valor)}{parecido.local ? ` em ${parecido.local}` : ''} ({dataCurta(parecido.data)}). Se for a mesma, toque em voltar; se for outra, salve normalmente.
        </p>
      )}
      <section className="cartao">
        <FormMovimento
          mov={lido ? { valor: lido.valor, local: lido.local, tipo: lido.tipo, categoria: lido.tipo === 'saida' ? lido.categoria : '', forma: lido.forma, parcelas: lido.parcelas } : undefined}
          origem="notificacao"
          aoSalvar={() => navegar('/gastos', { replace: true })}
        />
      </section>
      <p className="mini suave">Nada é salvo sem você confirmar. O que foi compartilhado é lido só aqui no seu aparelho.</p>
    </main>
  );
}
