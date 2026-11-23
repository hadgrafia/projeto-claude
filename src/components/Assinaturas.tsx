import { useState } from 'react';
import { Link } from 'react-router-dom';
import { db, type Perfil } from '../db';
import { assinaturasDe, CATEGORIAS_ASSINATURA, diasAte, proximaCobranca, respondeuAssinaturas, servicoDe, SERVICOS, totalMensal, type Assinatura, type Servico } from '../lib/assinaturas';
import { dataCurta, reais } from '../lib/format';
import { BotaoSalvar, CampoDinheiro, Folha, Segmentado } from './Ui';
import { Icone } from './Icone';
import { IconeMarca } from './IconeMarca';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const novoId = () => Math.random().toString(36).slice(2, 10);

export const IconeServico = ({ a, tamanho = 36 }: { a: Pick<Assinatura, 'servico' | 'nome'>; tamanho?: number }) => {
  const s = servicoDe(a);
  return <IconeMarca icone={s.icone} sigla={s.sigla} cor={s.cor} nome={s.nome} tamanho={tamanho} />;
};

/** Valor, mensal/anual e dia da cobrança de uma assinatura. */
function FormCobranca({ nome, inicial, aoSalvar, aoCancelar }: { nome: string; inicial?: Assinatura; aoSalvar: (d: Pick<Assinatura, 'valor' | 'ciclo' | 'dia' | 'mes'>) => void; aoCancelar: () => void }) {
  const [valor, setValor] = useState<number | undefined>(inicial?.valor);
  const [ciclo, setCiclo] = useState<Assinatura['ciclo']>(inicial?.ciclo ?? 'mensal');
  const [dia, setDia] = useState<number | undefined>(inicial?.dia);
  const [mes, setMes] = useState<number>(inicial?.mes ?? new Date().getMonth() + 1);
  const ok = Boolean(valor && valor > 0 && dia && dia >= 1 && dia <= 31);
  return (
    <div className="acao" style={{ gap: 10 }}>
      <strong className="pequeno">{nome}</strong>
      <CampoDinheiro rotulo="Quanto custa?" valor={valor} aoMudar={setValor} />
      <Segmentado rotulo="Cobrança" valor={ciclo} aoMudar={setCiclo} opcoes={[{ valor: 'mensal', rotulo: 'Por mês' }, { valor: 'anual', rotulo: 'Por ano' }]} />
      <div className="grade-2">
        <label className="campo">
          Dia da cobrança
          <input inputMode="numeric" value={dia ?? ''} onChange={(e) => setDia(Number(e.target.value.replace(/\D/g, '')) || undefined)} placeholder="Ex.: 5" maxLength={2} />
        </label>
        {ciclo === 'anual' && (
          <label className="campo">
            Mês
            <select value={mes} onChange={(e) => setMes(Number(e.target.value))}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="grade-2">
        <BotaoSalvar className="botao pequeno" disabled={!ok} salvo={inicial ? 'Salvo' : 'Adicionado'} aoSalvar={() => undefined} depois={() => aoSalvar({ valor: valor!, ciclo, dia: dia!, mes: ciclo === 'anual' ? mes : undefined })}>
          {inicial ? 'Salvar' : 'Adicionar'}
        </BotaoSalvar>
        <button type="button" className="botao secundario pequeno" onClick={aoCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

/** Lista das assinaturas da pessoa com o catálogo para adicionar (busca, categorias e "outra"). */
export function EscolherAssinaturas({ valor, aoMudar }: { valor: Assinatura[]; aoMudar: (v: Assinatura[]) => void }) {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<Servico['categoria'] | ''>('');
  const [abrindo, setAbrindo] = useState<{ servico?: Servico; nome: string; editando?: Assinatura }>();
  const [outro, setOutro] = useState('');

  const termo = busca.trim().toLowerCase();
  const catalogo = SERVICOS.filter((s) => (!categoria || s.categoria === categoria) && (!termo || s.nome.toLowerCase().includes(termo)) && !valor.some((v) => v.servico === s.id));

  const salvar = (d: Pick<Assinatura, 'valor' | 'ciclo' | 'dia' | 'mes'>) => {
    if (!abrindo) return;
    if (abrindo.editando) aoMudar(valor.map((v) => (v.id === abrindo.editando!.id ? { ...v, ...d } : v)));
    else aoMudar([...valor, { id: novoId(), servico: abrindo.servico?.id, nome: abrindo.servico?.nome ?? abrindo.nome, ...d }]);
    setAbrindo(undefined);
    setOutro('');
    setBusca('');
  };

  return (
    <div className="coluna" style={{ gap: 12 }}>
      {valor.length > 0 && (
        <div className="coluna" style={{ gap: 8 }}>
          {valor.map((a) => (
            <div key={a.id} className="linha" style={{ alignItems: 'center', gap: 10 }}>
              <IconeServico a={a} />
              <span className="cresce coluna" style={{ gap: 0 }}>
                <strong className="pequeno">{a.nome}</strong>
                <span className="mini suave">{reais(a.valor)} {a.ciclo === 'anual' ? `por ano · dia ${a.dia}/${MESES[(a.mes ?? 1) - 1]}` : `por mês · dia ${a.dia}`}</span>
              </span>
              <button type="button" className="circulo card" aria-label={`Editar ${a.nome}`} onClick={() => setAbrindo({ servico: SERVICOS.find((s) => s.id === a.servico), nome: a.nome, editando: a })}><Icone nome="lapis" tamanho={16} /></button>
              <button type="button" className="circulo card" aria-label={`Remover ${a.nome}`} onClick={() => aoMudar(valor.filter((v) => v.id !== a.id))}><Icone nome="lixo" tamanho={16} /></button>
            </div>
          ))}
        </div>
      )}

      {abrindo ? (
        <FormCobranca nome={abrindo.servico?.nome ?? abrindo.nome} inicial={abrindo.editando} aoSalvar={salvar} aoCancelar={() => setAbrindo(undefined)} />
      ) : (
        <>
          <label className="campo">
            Buscar assinatura
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Netflix, Spotify, ChatGPT…" autoComplete="off" />
          </label>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={!categoria} onClick={() => setCategoria('')}>Todas</button>
            {CATEGORIAS_ASSINATURA.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={categoria === c} onClick={() => setCategoria(c)}>{c}</button>
            ))}
          </div>
          <div className="grade-servicos">
            {catalogo.map((s) => (
              <button key={s.id} type="button" className="servico" onClick={() => setAbrindo({ servico: s, nome: s.nome })}>
                <IconeMarca icone={s.icone} sigla={s.sigla} cor={s.cor} nome={s.nome} tamanho={40} />
                <span className="mini">{s.nome}</span>
              </button>
            ))}
            {!catalogo.length && <p className="pequeno suave">Nenhuma assinatura com esse nome na lista. Adicione abaixo.</p>}
          </div>
          <div className="linha" style={{ gap: 8, alignItems: 'flex-end' }}>
            <label className="campo cresce">
              Não está na lista? Escreva o nome
              <input value={outro} onChange={(e) => setOutro(e.target.value)} placeholder="Ex.: Clube do vinho" maxLength={40} autoComplete="off" />
            </label>
            <button type="button" className="botao secundario pequeno" disabled={!outro.trim()} onClick={() => setAbrindo({ nome: outro.trim() })}>Adicionar</button>
          </div>
        </>
      )}
    </div>
  );
}

export async function salvarAssinaturas(lista: Assinatura[]) {
  await db.perfil.update('eu', { assinaturas: lista, assinaturasRespondido: true });
}

/** Início: pede as assinaturas até a pessoa responder; depois mostra o resumo e a próxima cobrança. */
export function CartaoAssinaturas({ perfil }: { perfil?: Perfil }) {
  const [aberta, setAberta] = useState(false);
  const [lista, setLista] = useState<Assinatura[]>(() => assinaturasDe(perfil));
  if (!perfil) return null;
  const minhas = assinaturasDe(perfil);
  if (respondeuAssinaturas(perfil) && !aberta) {
    if (!minhas.length) return null;
    const proxima = [...minhas].sort((a, b) => proximaCobranca(a).getTime() - proximaCobranca(b).getTime())[0];
    const dias = diasAte(proximaCobranca(proxima));
    return (
      <Link to="/assinaturas" className="cartao cartao-link" style={{ gridColumn: '1 / -1', flexDirection: 'row', alignItems: 'center' }}>
        <IconeServico a={proxima} />
        <span className="cresce coluna" style={{ gap: 2 }}>
          <strong>Assinaturas: {reais(totalMensal(minhas))}/mês</strong>
          <span className="pequeno suave">Próxima: {proxima.nome}, {dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias (${dataCurta(proximaCobranca(proxima).toISOString())})`}</span>
        </span>
        <Icone nome="direita" />
      </Link>
    );
  }
  return (
    <>
      <button type="button" className="cartao verde cartao-link" style={{ gridColumn: '1 / -1', flexDirection: 'row', alignItems: 'center', textAlign: 'left', border: 0, cursor: 'pointer' }} onClick={() => setAberta(true)}>
        <span className="avatar-agente" style={{ width: 40, height: 40, background: '#C08A3E', fontSize: 17 }}>L</span>
        <span className="cresce coluna" style={{ gap: 2 }}>
          <strong>Cadastre suas assinaturas</strong>
          <span className="pequeno">Netflix, Spotify, IA… A Lari avisa antes de cada cobrança.</span>
        </span>
        <Icone nome="direita" />
      </button>
      <Folha aberta={aberta} aoFechar={() => setAberta(false)} titulo="Suas assinaturas">
        <EscolherAssinaturas valor={lista} aoMudar={setLista} />
        <BotaoSalvar disabled={!lista.length} aoSalvar={() => salvarAssinaturas(lista)} depois={() => setAberta(false)}>
          Salvar ({lista.length})
        </BotaoSalvar>
        <button type="button" className="botao secundario pequeno" onClick={async () => { await salvarAssinaturas([]); setAberta(false); }}>
          Não tenho assinaturas
        </button>
      </Folha>
    </>
  );
}
