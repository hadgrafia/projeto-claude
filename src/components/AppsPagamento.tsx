import { useEffect, useMemo, useState } from 'react';
import { db, type Perfil } from '../db';
import { APPS_PADRAO, listaDeApps } from '../lib/appsPagamento';
import { ehAppAndroid, Leitor, type AppInfo } from '../lib/nativo';

type Item = { pacote?: string; nome: string };
const chave = (a: Item) => a.pacote ?? `nome:${a.nome.toLowerCase()}`;

/** Ajustes: quais apps de pagamento o Meus Planos pode ler (o resto é ignorado). */
export function AppsPagamento({ perfil, aoSalvar }: { perfil: Perfil; aoSalvar: (m: string) => void }) {
  const android = ehAppAndroid();
  const [escolhidos, setEscolhidos] = useState<Item[]>(() => listaDeApps(perfil));
  const [ignorados, setIgnorados] = useState<AppInfo[]>([]);
  const [instalados, setInstalados] = useState<AppInfo[]>([]);
  const [busca, setBusca] = useState('');
  const [novoNome, setNovoNome] = useState('');

  useEffect(() => {
    if (!android) return;
    Leitor.apps()
      .then((r) => {
        setIgnorados(r.ignorados);
        setInstalados(r.instalados.sort((a, b) => a.nome.localeCompare(b.nome)));
        // No aparelho já existia uma escolha e a conta ainda não tem: usa a do aparelho.
        if (r.configurado && !perfil.appsPagamento) {
          const nomes = new Map([...r.padrao, ...r.instalados, ...r.ignorados].map((a) => [a.pacote, a.nome]));
          setEscolhidos(r.permitidos.map((p) => ({ pacote: p, nome: nomes.get(p) ?? p })));
        }
      })
      .catch(() => undefined);
  }, [android, perfil.appsPagamento]);

  const marcados = new Set(escolhidos.map(chave));
  const alternar = (a: Item) => setEscolhidos((l) => (l.some((x) => chave(x) === chave(a)) ? l.filter((x) => chave(x) !== chave(a)) : [...l, a]));
  const candidatos = useMemo(() => {
    const base: Item[] = [...APPS_PADRAO.filter((a) => (android ? a.pacote : true)), ...escolhidos];
    const vistos = new Set<string>();
    return base.filter((a) => !vistos.has(chave(a)) && vistos.add(chave(a)));
  }, [android, escolhidos]);
  const achados = busca.trim().length >= 2 ? instalados.filter((a) => a.nome.toLowerCase().includes(busca.trim().toLowerCase()) && !marcados.has(a.pacote)).slice(0, 8) : [];

  async function salvar() {
    await db.perfil.update('eu', { appsPagamento: escolhidos });
    if (android) await Leitor.definirApps({ pacotes: escolhidos.filter((a) => a.pacote).map((a) => a.pacote!) }).catch(() => undefined);
    aoSalvar('Apps de pagamento salvos. Avisos de outros apps serão ignorados.');
  }

  const caixa = (a: Item) => (
    <label key={chave(a)} className="linha pequeno" style={{ gap: 10 }}>
      <input type="checkbox" checked={marcados.has(chave(a))} onChange={() => alternar(a)} style={{ width: 20, height: 20, accentColor: 'var(--terracota)' }} />
      {a.nome}
    </label>
  );

  return (
    <section className="cartao">
      <h2 style={{ fontSize: 15, fontWeight: 800 }}>Apps de pagamento que o app lê</h2>
      <p className="mini suave">
        {android
          ? 'Só os avisos destes apps viram lançamentos. Avisos de outros apps (cotação do dólar, notícias, redes sociais) são ignorados.'
          : 'Vale para os avisos que chegam pelas automações (Atalhos do iPhone com a Apple Wallet, MacroDroid): avisos de apps fora da lista são ignorados.'}
      </p>
      <strong className="pequeno">Pagamento por aproximação</strong>
      {candidatos.filter((a) => APPS_PADRAO.find((p) => chave(p) === chave(a))?.carteira).map(caixa)}
      <strong className="pequeno">Bancos e apps de pagamento</strong>
      {candidatos.filter((a) => !APPS_PADRAO.find((p) => chave(p) === chave(a))?.carteira).map(caixa)}

      {android && ignorados.filter((a) => !marcados.has(a.pacote)).length > 0 && (
        <>
          <strong className="pequeno">Mandaram avisos com valor, mas estão fora da lista</strong>
          {ignorados.filter((a) => !marcados.has(a.pacote)).map((a) => caixa(a))}
        </>
      )}

      {android ? (
        <label className="campo">
          Adicionar outro app de pagamento
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite o nome do app" autoComplete="off" />
          {achados.map((a) => (
            <button key={a.pacote} type="button" className="chip" style={{ justifySelf: 'start' }} onClick={() => { alternar(a); setBusca(''); }}>
              + {a.nome}
            </button>
          ))}
        </label>
      ) : (
        <div className="linha" style={{ gap: 8, alignItems: 'flex-end' }}>
          <label className="campo cresce">
            Adicionar outro app de pagamento
            <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do app" autoComplete="off" maxLength={40} />
          </label>
          <button type="button" className="botao secundario pequeno" disabled={!novoNome.trim()} onClick={() => { alternar({ nome: novoNome.trim() }); setNovoNome(''); }}>
            Adicionar
          </button>
        </div>
      )}
      <button type="button" className="botao pequeno" onClick={salvar}>Salvar apps</button>
    </section>
  );
}
