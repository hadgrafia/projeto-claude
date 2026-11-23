import { useEffect, useState } from 'react';
import { pegarArquivoParaImportar } from '../lib/compartilhar';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import { Entra, Segmentado } from '../components/Ui';
import { db, type Movimento } from '../db';
import { itensCartao } from '../lib/cartao';
import { conciliar } from '../lib/conciliar';
import { NOMES_CATEGORIAS } from '../lib/categorias';
import { dataCurta, mesLongo, reais, somarMeses, chaveMes } from '../lib/format';
import { aplicarTipoArquivo, lerArquivoExtrato, type NovoMovimento, type TipoArquivo } from '../lib/importar';

export default function Importar() {
  const navegar = useNavigate();
  const [itens, setItens] = useState<(NovoMovimento & { ok: boolean; repetido: boolean; igual?: Movimento; exato?: boolean })[]>([]);
  const [estado, setEstado] = useState<'' | 'lendo' | 'erro' | 'pronto'>('');
  const [msg, setMsg] = useState('');
  const [tipoArq, setTipoArq] = useState<TipoArquivo>('conta');
  const [faturaMes, setFaturaMes] = useState<string>();
  const [arquivo, setArquivo] = useState<File>();

  // Extrato que chegou por "Compartilhar" no app do banco.
  useEffect(() => {
    const f = pegarArquivoParaImportar();
    if (f) ler(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mudou o tipo do arquivo (conta, fatura) ou o mês da fatura: lê de novo.
  useEffect(() => {
    if (arquivo) ler(arquivo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoArq, faturaMes]);

  async function ler(arq: File) {
    setArquivo(arq);
    setEstado('lendo');
    try {
      const perfil = await db.perfil.get('eu');
      const lidos = aplicarTipoArquivo(await lerArquivoExtrato(arq), tipoArq, perfil, faturaMes);
      // Fatura: parcela 2, 3… de uma compra que o app já acompanha não entra de novo.
      const noCartao = tipoArq === 'fatura' ? itensCartao(perfil, await db.compras.toArray(), await db.movimentos.toArray()) : [];
      const parcelaConhecida = (l: NovoMovimento) =>
        Boolean(l.parcelaAtual && l.parcelaAtual > 1 && noCartao.some((i) => i.parcelas === l.parcelas && Math.abs(i.valorParcela - l.valor) <= Math.max(0.05, l.valor * 0.02)));
      // Compara com o que já foi registrado (avisos do banco, comprovantes, à mão, extratos anteriores).
      const datas = lidos.map((l) => new Date(l.data).getTime());
      const de = new Date(Math.min(...datas) - 4 * 864e5).toISOString();
      const ate = new Date(Math.max(...datas) + 4 * 864e5).toISOString();
      const existentes = lidos.length ? await db.movimentos.where('data').between(de, ate, true, true).toArray() : [];
      setItens(
        conciliar(lidos, existentes).map(({ item, igual, exato }) => {
          const conhecida = !igual && parcelaConhecida(item);
          return { ...item, igual, exato, repetido: Boolean(igual) || conhecida, ok: !igual && !conhecida };
        }),
      );
      setEstado('pronto');
      setMsg(lidos.length ? '' : 'Não encontrei lançamentos neste arquivo. Tente o formato OFX ou CSV, que todo banco exporta.');
    } catch {
      setEstado('erro');
      setMsg('Não consegui ler este arquivo. Tente exportar o extrato em OFX ou CSV.');
    }
  }

  async function salvar() {
    const novos = itens
      .filter((i) => i.ok)
      .map(({ ok: _ok, repetido: _r, igual: _i, exato: _e, ...m }) => ({ ...m, local: m.local?.trim() || undefined, localPendente: !m.local?.trim() }));
    await db.movimentos.bulkAdd(novos);
    // O que já existia sem o nome do lugar ganha o nome que veio no extrato.
    for (const i of itens) {
      if (!i.ok && i.igual?.id && i.igual.localPendente && i.local?.trim()) {
        await db.movimentos.update(i.igual.id, { local: i.local.trim(), descricao: i.local.trim(), localPendente: false });
      }
      // O aviso não disse se foi débito ou crédito, mas o extrato/fatura diz.
      if (!i.ok && i.igual?.id && i.igual.formaPendente && i.forma) {
        await db.movimentos.update(i.igual.id, { forma: i.forma, parcelas: i.parcelas, formaPendente: false });
      }
    }
    navegar('/gastos');
  }

  const selecionados = itens.filter((i) => i.ok);
  const origemTexto = (m: Movimento) => (m.origem === 'notificacao' ? 'pelo aviso do banco' : m.origem === 'extrato' ? 'por um extrato anterior' : 'à mão');

  return (
    <main className="tela sem-nav">
      <div className="linha">
        <button type="button" className="circulo escuro" aria-label="Voltar" onClick={() => navegar(-1)}><Icone nome="voltar" /></button>
        <h1 className="titulo" style={{ fontSize: 24 }}>Enviar extrato</h1>
      </div>
      <div className="cartao verde">
        <div className="linha" style={{ alignItems: 'flex-start' }}>
          <Icone nome="escudo" cor="#D9774F" />
          <p className="pequeno" style={{ fontSize: 14 }}>O arquivo é lido aqui no seu celular; só os lançamentos que você salvar entram na sua conta (cifrados). Você baixa o extrato no app do seu banco; o Meus Planos nunca acessa o banco.</p>
        </div>
      </div>
      <p className="subtitulo">Aceita PDF, OFX e CSV. OFX e CSV são os mais precisos; PDF depende do layout de cada banco, então confira a lista antes de salvar.</p>

      <Segmentado
        rotulo="Que arquivo é este?"
        valor={tipoArq}
        aoMudar={setTipoArq}
        opcoes={[
          { valor: 'conta', rotulo: 'Extrato da conta' },
          { valor: 'fatura', rotulo: 'Fatura do cartão' },
          { valor: 'misto', rotulo: 'Não sei' },
        ]}
      />
      <span className="mini suave">
        {tipoArq === 'conta'
          ? 'Gastos da conta entram como débito, Pix ou boleto.'
          : tipoArq === 'fatura'
            ? 'Tudo entra no crédito e no limite do cartão. "PARC 03/10" é lido como parcela 3 de 10. O pagamento da fatura fica de fora (ele já está no extrato da conta).'
            : 'O que o arquivo não disser se foi no débito ou no crédito, o app pergunta depois.'}
      </span>
      {tipoArq === 'fatura' && (
        <label className="campo">
          Esta fatura vence em
          <select value={faturaMes ?? ''} onChange={(e) => setFaturaMes(e.target.value || undefined)}>
            <option value="">Descobrir pelas datas</option>
            {[-1, 0, 1, 2].map((k) => {
              const m = somarMeses(chaveMes(new Date()), k);
              return <option key={m} value={m}>{mesLongo(m)} de {m.slice(0, 4)}</option>;
            })}
          </select>
        </label>
      )}

      <label className="botao seta" style={{ cursor: 'pointer' }}>
        {estado === 'lendo' ? 'Lendo arquivo…' : 'Escolher arquivo do extrato'}
        <span className="ponta"><Icone nome="upload" /></span>
        <input type="file" accept=".pdf,.ofx,.csv,.txt,application/pdf,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} />
      </label>
      {msg && <p className="cartao areia pequeno">{msg}</p>}

      {itens.length > 0 && (
        <>
          <div className="entre">
            <strong>{selecionados.length} de {itens.length} para salvar</strong>
            <span className="pequeno suave">{itens.filter((i) => i.repetido).length} já registrados · {selecionados.filter((i) => !i.local).length} sem lugar</span>
          </div>
          <div className="lista">
            {itens.map((m, i) => (
              <Entra key={m.chave + i} i={i}>
                <div className="item" style={{ cursor: 'default', opacity: m.repetido && !m.ok ? 0.55 : 1 }}>
                  <input
                    type="checkbox"
                    aria-label={`Incluir ${m.descricao}`}
                    checked={m.ok}
                    disabled={m.exato}
                    onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)))}
                    style={{ width: 22, height: 22 }}
                  />
                  <span className="cresce coluna" style={{ gap: 2 }}>
                    <input
                      aria-label={`Nome do lugar de ${m.descricao}`}
                      value={m.local ?? ''}
                      placeholder="Onde foi? Informe o lugar"
                      onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, local: e.target.value, localPendente: !e.target.value.trim() } : x)))}
                      style={{ border: 0, borderBottom: `1px dashed ${m.local ? 'transparent' : 'var(--terracota-texto)'}`, background: 'transparent', fontWeight: 700, fontSize: 14, padding: '2px 0', width: '100%' }}
                    />
                    {m.local !== m.descricao && <span className="mini suave" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descricao}</span>}
                    {m.repetido && !m.igual && <span className="mini" style={{ fontWeight: 600 }}>✓ Parcela {m.parcelaAtual}/{m.parcelas} de uma compra que o app já acompanha.</span>}
                    {m.tipo === 'saida' && m.forma === 'credito' && m.parcelas && m.parcelas > 1 && !m.repetido && (
                      <span className="mini suave">Crédito · {m.parcelaAtual ? `parcela ${m.parcelaAtual} de ${m.parcelas}` : `${m.parcelas}x`}</span>
                    )}
                    {m.igual && (
                      <span className="mini" style={{ color: 'var(--verde-texto, var(--texto))', fontWeight: 600 }}>
                        ✓ Já registrado {origemTexto(m.igual)}{m.igual.local ? ` (${m.igual.local}, ${dataCurta(m.igual.data)})` : ` em ${dataCurta(m.igual.data)}`}
                        {!m.exato && !m.ok ? '. Marque se for outra compra.' : ''}
                      </span>
                    )}
                    {m.tipo === 'saida' ? (
                      <select
                        aria-label="Categoria"
                        value={m.categoria}
                        onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, categoria: e.target.value } : x)))}
                        style={{ border: 0, background: 'transparent', color: 'var(--suave)', fontSize: 13, padding: 0 }}
                      >
                        {NOMES_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <span className="pequeno suave">Entrada</span>
                    )}
                  </span>
                  <span className="coluna" style={{ alignItems: 'flex-end', gap: 2 }}>
                    <strong className="num" style={{ fontSize: 14 }}>{m.tipo === 'entrada' ? '+' : '−'}{reais(m.valor)}</strong>
                    <span className="mini suave">{dataCurta(m.data)}</span>
                  </span>
                </div>
              </Entra>
            ))}
          </div>
          <button type="button" className="botao" disabled={!selecionados.length} onClick={salvar}>
            Salvar {selecionados.length} lançamentos
          </button>
        </>
      )}
    </main>
  );
}
