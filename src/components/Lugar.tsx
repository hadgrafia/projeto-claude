import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { db, type Importancia, type Movimento, type TipoMov } from '../db';
import { inicioParcelas } from '../lib/compras';
import { conferirLimiteCartao } from '../lib/avisos';
import { categorizar } from '../lib/categorias';
import { hora, reais } from '../lib/format';
import { lugarInformadoNoApp } from '../lib/nativo';
import { Icone } from './Icone';
import { CampoDinheiro, Folha } from './Ui';
import { FormForma } from './FormaPagamento';

/** Lugares mais usados, para sugerir com um toque. */
export function useLugaresRecentes(tipo: TipoMov = 'saida') {
  return (
    useLiveQuery(async () => {
      const cont = new Map<string, number>();
      const recentes = await db.movimentos.orderBy('data').reverse().limit(400).toArray();
      for (const m of recentes) if (m.local && m.tipo === tipo) cont.set(m.local, (cont.get(m.local) ?? 0) + 1);
      return [...cont].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l]) => l);
    }, [tipo]) ?? []
  );
}

export function CampoLugar({ tipo, valor, aoMudar, sugestoes, autoFoco }: { tipo: TipoMov; valor: string; aoMudar: (v: string) => void; sugestoes: string[]; autoFoco?: boolean }) {
  return (
    <div className="coluna">
      <label className="campo">
        {tipo === 'entrada' ? 'De quem ou de onde veio?' : 'Onde foi? (nome da loja ou lugar)'}
        <input
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          placeholder={tipo === 'entrada' ? 'Ex.: Cliente Ana, Empresa X' : 'Ex.: Padaria Pão Quente, iFood'}
          autoFocus={autoFoco}
          autoCapitalize="words"
          list="lugares-recentes"
          enterKeyHint="done"
        />
        <datalist id="lugares-recentes">{sugestoes.map((s) => <option key={s} value={s} />)}</datalist>
      </label>
      {sugestoes.length > 0 && (
        <div className="chips">
          {sugestoes.slice(0, 6).map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={valor === s} onClick={() => aoMudar(s)}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Pergunta o lugar dos gastos que chegaram sem ele (notificação ou extrato).
 * Aparece sozinha assim que o app abre ou recebe um gasto novo; um de cada vez.
 */
export function PerguntaLocal() {
  const pendentes = useLiveQuery(async () => (await db.movimentos.orderBy('data').reverse().toArray()).filter((m) => m.localPendente || m.formaPendente || m.detalhePendente), []) ?? [];
  const [adiados, setAdiados] = useState<Set<number>>(new Set());
  const atual = pendentes.find((m) => !adiados.has(m.id!));
  return (
    <Folha
      aberta={!!atual}
      aoFechar={() => atual && setAdiados(new Set(adiados).add(atual.id!))}
      titulo={atual?.localPendente ? (atual.tipo === 'entrada' ? 'De onde veio este dinheiro?' : 'Onde foi este gasto?') : atual?.formaPendente ? 'Débito ou crédito?' : 'Conte sobre esta compra'}
    >
      {atual?.localPendente && <FormLocal key={atual.id} mov={atual} restantes={pendentes.length - 1} aoAdiar={() => setAdiados(new Set(adiados).add(atual.id!))} />}
      {atual && !atual.localPendente && atual.formaPendente && (
        <FormForma key={`f${atual.id}`} mov={atual} restantes={pendentes.length - 1} aoAdiar={() => setAdiados(new Set(adiados).add(atual.id!))} />
      )}
      {atual && !atual.localPendente && !atual.formaPendente && atual.detalhePendente && (
        <FormDetalheCompra key={`d${atual.id}`} mov={atual} aoAdiar={() => setAdiados(new Set(adiados).add(atual.id!))} />
      )}
    </Folha>
  );
}

function FormLocal({ mov, restantes, aoAdiar }: { mov: Movimento; restantes: number; aoAdiar: () => void }) {
  const [local, setLocal] = useState('');
  const sugestoes = useLugaresRecentes(mov.tipo);
  async function salvar() {
    const lugar = local.trim();
    if (!lugar) return;
    const auto = categorizar(lugar, mov.tipo);
    await db.movimentos.update(mov.id!, {
      local: lugar,
      localPendente: false,
      descricao: lugar,
      categoria: mov.tipo === 'entrada' ? 'Entrada' : auto !== 'Outros' ? auto : mov.categoria,
    });
    lugarInformadoNoApp(mov.chave);
  }
  return (
    <>
      <motion.div className="cartao verde" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <div className="entre">
          <span className="suave pequeno">{mov.avisadoPor ? `Aviso do ${mov.avisadoPor}` : mov.origem === 'extrato' ? 'Do extrato' : 'Lançamento'}</span>
          <span className="suave pequeno">{new Date(mov.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {hora(mov.data)}</span>
        </div>
        <strong className="valor-grande" style={{ fontSize: 30 }}>{mov.tipo === 'entrada' ? '+' : ''}{reais(mov.valor)}</strong>
        <span className="suave pequeno">Não deu para ler o nome do lugar. Informe para o seu feedback ficar mais claro.</span>
      </motion.div>
      <form className="coluna" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <CampoLugar tipo={mov.tipo} valor={local} aoMudar={setLocal} sugestoes={sugestoes} autoFoco />
        <button type="submit" className="botao" disabled={!local.trim()}>
          <Icone nome="check" /> Salvar{restantes > 0 ? ` (faltam ${restantes})` : ''}
        </button>
        <button type="button" className="botao secundario pequeno" onClick={aoAdiar}>Agora não</button>
      </form>
    </>
  );
}

/** Compra acima do valor de aviso: finalidade, importância e parcelamento (entra no controle de parcelas e do cartão). */
function FormDetalheCompra({ mov, aoAdiar }: { mov: Movimento; aoAdiar: () => void }) {
  const [descricao, setDescricao] = useState(mov.local ?? '');
  const [importancia, setImportancia] = useState<Importancia>();
  const [parcelas, setParcelas] = useState(mov.parcelas ?? 1);
  const [juros, setJuros] = useState<number>();
  const [noCartao, setNoCartao] = useState(mov.forma ? mov.forma === 'credito' : true);
  const [total, setTotal] = useState<number | undefined>(mov.valor);
  const ok = Boolean(descricao.trim() && importancia && total);

  async function salvar() {
    if (!ok) return;
    const i = (juros ?? 0) / 100;
    const valorParcela = parcelas > 1 ? (i > 0 ? (total! * i) / (1 - Math.pow(1 + i, -parcelas)) : total! / parcelas) : total!;
    const perfil = await db.perfil.get('eu');
    await db.transaction('rw', db.compras, db.movimentos, async () => {
      await db.compras.add({
        descricao: descricao.trim(),
        importancia: importancia!,
        valor: total!,
        parcelas,
        juros: juros ?? 0,
        valorParcela,
        noCartao,
        inicio: inicioParcelas(noCartao, new Date(mov.data), perfil),
        movimentoChave: mov.chave,
        criadaEm: new Date().toISOString(),
      });
      await db.movimentos.update(mov.id!, { detalhePendente: false, forma: noCartao ? 'credito' : mov.forma === 'credito' ? undefined : mov.forma, parcelas: noCartao && parcelas > 1 ? parcelas : undefined });
    });
    if (noCartao) conferirLimiteCartao().catch(() => undefined);
  }

  return (
    <>
      <div className="cartao verde">
        <span className="suave pequeno">{mov.local ?? 'Compra'} · {hora(mov.data)}</span>
        <strong className="valor-grande" style={{ fontSize: 30 }}>{reais(mov.valor)}</strong>
        <span className="suave pequeno">Compras acima do seu valor de aviso entram no controle de parcelas e do limite do cartão.</span>
      </div>
      <label className="campo">
        O que foi comprado ou para quê?
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: presente, conserto do carro" />
      </label>
      <div className="chips" role="radiogroup" aria-label="Importância">
        {(['necessidade', 'util', 'desejo'] as Importancia[]).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={importancia === v} className="chip" onClick={() => setImportancia(v)} style={importancia === v ? { background: 'var(--verde)', color: 'var(--sobre-verde)' } : undefined}>
            {v === 'necessidade' ? 'Necessidade' : v === 'util' ? 'Útil' : 'Desejo'}
          </button>
        ))}
      </div>
      <CampoDinheiro rotulo="Valor total da compra" valor={total} aoMudar={setTotal} dica="Se o aviso mostrou só o valor da parcela, corrija para o total." />
      <div className="grade-2">
        <label className="campo">
          Parcelas
          <select value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
            <option value={1}>À vista</option>
            {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}x</option>)}
          </select>
        </label>
        <label className="campo">
          Juros ao mês
          <div className="com-sufixo">
            <input inputMode="decimal" value={juros ?? ''} onChange={(e) => setJuros(e.target.value ? Number(e.target.value.replace(',', '.')) : undefined)} placeholder="0 = sem juros" disabled={parcelas === 1} />
            <span>%</span>
          </div>
        </label>
      </div>
      <div className="chips">
        <button type="button" className="chip" aria-pressed={noCartao} onClick={() => setNoCartao(true)}>No cartão de crédito</button>
        <button type="button" className="chip" aria-pressed={!noCartao} onClick={() => setNoCartao(false)}>Outra forma</button>
      </div>
      <button type="button" className="botao" disabled={!ok} onClick={salvar}><Icone nome="check" /> Salvar</button>
      <button type="button" className="botao secundario pequeno" onClick={aoAdiar}>Agora não</button>
    </>
  );
}
