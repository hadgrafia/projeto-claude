import { useEffect, useState } from 'react';
import { pegarArquivoParaImportar } from '../lib/compartilhar';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import { Entra } from '../components/Ui';
import { db, type Movimento } from '../db';
import { conciliar } from '../lib/conciliar';
import { NOMES_CATEGORIAS } from '../lib/categorias';
import { dataCurta, reais } from '../lib/format';
import { lerArquivoExtrato, type NovoMovimento } from '../lib/importar';

export default function Importar() {
  const navegar = useNavigate();
  const [itens, setItens] = useState<(NovoMovimento & { ok: boolean; repetido: boolean; igual?: Movimento; exato?: boolean })[]>([]);
  const [estado, setEstado] = useState<'' | 'lendo' | 'erro' | 'pronto'>('');
  const [msg, setMsg] = useState('');

  // Extrato que chegou por "Compartilhar" no app do banco.
  useEffect(() => {
    const f = pegarArquivoParaImportar();
    if (f) ler(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ler(arquivo: File) {
    setEstado('lendo');
    try {
      const lidos = await lerArquivoExtrato(arquivo);
      // Compara com o que já foi registrado (avisos do banco, comprovantes, à mão, extratos anteriores).
      const datas = lidos.map((l) => new Date(l.data).getTime());
      const de = new Date(Math.min(...datas) - 4 * 864e5).toISOString();
      const ate = new Date(Math.max(...datas) + 4 * 864e5).toISOString();
      const existentes = lidos.length ? await db.movimentos.where('data').between(de, ate, true, true).toArray() : [];
      setItens(conciliar(lidos, existentes).map(({ item, igual, exato }) => ({ ...item, igual, exato, repetido: Boolean(igual), ok: !igual })));
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
