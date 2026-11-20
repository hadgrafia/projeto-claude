import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { db, type Movimento, type TipoMov } from '../db';
import { categorizar } from '../lib/categorias';
import { hora, reais } from '../lib/format';
import { lugarInformadoNoApp } from '../lib/nativo';
import { Icone } from './Icone';
import { Folha } from './Ui';

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
  const pendentes = useLiveQuery(async () => (await db.movimentos.orderBy('data').reverse().toArray()).filter((m) => m.localPendente), []) ?? [];
  const [adiados, setAdiados] = useState<Set<number>>(new Set());
  const atual = pendentes.find((m) => !adiados.has(m.id!));
  return (
    <Folha aberta={!!atual} aoFechar={() => atual && setAdiados(new Set(adiados).add(atual.id!))} titulo={atual?.tipo === 'entrada' ? 'De onde veio este dinheiro?' : 'Onde foi este gasto?'}>
      {atual && <FormLocal key={atual.id} mov={atual} restantes={pendentes.length - 1} aoAdiar={() => setAdiados(new Set(adiados).add(atual.id!))} />}
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
