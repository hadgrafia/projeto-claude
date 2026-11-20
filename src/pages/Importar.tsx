import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import { Entra } from '../components/Ui';
import { db } from '../db';
import { NOMES_CATEGORIAS } from '../lib/categorias';
import { dataCurta, reais } from '../lib/format';
import { lerArquivoExtrato, type NovoMovimento } from '../lib/importar';

export default function Importar() {
  const navegar = useNavigate();
  const [itens, setItens] = useState<(NovoMovimento & { ok: boolean; repetido: boolean })[]>([]);
  const [estado, setEstado] = useState<'' | 'lendo' | 'erro' | 'pronto'>('');
  const [msg, setMsg] = useState('');

  async function ler(arquivo: File) {
    setEstado('lendo');
    try {
      const lidos = await lerArquivoExtrato(arquivo);
      const existentes = new Set((await db.movimentos.where('chave').anyOf(lidos.map((l) => l.chave)).toArray()).map((m) => m.chave));
      setItens(lidos.map((l) => ({ ...l, repetido: existentes.has(l.chave), ok: !existentes.has(l.chave) })));
      setEstado('pronto');
      setMsg(lidos.length ? '' : 'Não encontrei lançamentos neste arquivo. Tente o formato OFX ou CSV, que todo banco exporta.');
    } catch {
      setEstado('erro');
      setMsg('Não consegui ler este arquivo. Tente exportar o extrato em OFX ou CSV.');
    }
  }

  async function salvar() {
    const novos = itens.filter((i) => i.ok && !i.repetido).map(({ ok: _ok, repetido: _r, ...m }) => m);
    await db.movimentos.bulkAdd(novos);
    navegar('/gastos');
  }

  const selecionados = itens.filter((i) => i.ok && !i.repetido);

  return (
    <main className="tela sem-nav">
      <div className="linha">
        <button type="button" className="circulo escuro" aria-label="Voltar" onClick={() => navegar(-1)}><Icone nome="voltar" /></button>
        <h1 className="titulo" style={{ fontSize: 24 }}>Enviar extrato</h1>
      </div>
      <div className="cartao verde">
        <div className="linha" style={{ alignItems: 'flex-start' }}>
          <Icone nome="escudo" cor="#D9774F" />
          <p className="pequeno" style={{ fontSize: 14 }}>O arquivo é lido aqui no seu celular e não é enviado para lugar nenhum. Você baixa o extrato no app do seu banco; o Meus Planos nunca acessa o banco.</p>
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
            <span className="pequeno suave">{itens.filter((i) => i.repetido).length} já existiam</span>
          </div>
          <div className="lista">
            {itens.map((m, i) => (
              <Entra key={m.chave + i} i={i}>
                <div className="item" style={{ cursor: 'default', opacity: m.repetido ? 0.5 : 1 }}>
                  <input
                    type="checkbox"
                    aria-label={`Incluir ${m.descricao}`}
                    checked={m.ok && !m.repetido}
                    disabled={m.repetido}
                    onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)))}
                    style={{ width: 22, height: 22 }}
                  />
                  <span className="cresce coluna" style={{ gap: 2 }}>
                    <strong style={{ fontSize: 14 }}>{m.descricao}</strong>
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
