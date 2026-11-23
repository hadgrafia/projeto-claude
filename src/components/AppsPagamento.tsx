import { useEffect, useMemo, useState } from 'react';
import { db, type Perfil } from '../db';
import { APPS_PADRAO, escolheuApps, listaDeApps } from '../lib/appsPagamento';
import { ehAppAndroid, Leitor, type AppInfo } from '../lib/nativo';
import { Icone } from './Icone';
import { BotaoSalvar, Folha } from './Ui';
import { IconeMarca } from './IconeMarca';

export type AppEscolhido = { pacote?: string; nome: string };
const chave = (a: AppEscolhido) => a.pacote ?? `nome:${a.nome.toLowerCase()}`;
const ehIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const ehAndroidWeb = () => /android/i.test(navigator.userAgent);

/** Seletor dos apps de pagamento (nada vem marcado). Mostra as carteiras do sistema da pessoa. */
export function EscolherApps({ valor, aoMudar }: { valor: AppEscolhido[]; aoMudar: (v: AppEscolhido[]) => void }) {
  const android = ehAppAndroid();
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
      })
      .catch(() => undefined);
  }, [android]);

  const marcados = new Set(valor.map(chave));
  const alternar = (a: AppEscolhido) => aoMudar(marcados.has(chave(a)) ? valor.filter((x) => chave(x) !== chave(a)) : [...valor, a]);
  // iPhone: Apple Wallet. Android: Samsung Wallet e Carteira do Google. Computador: todas.
  const carteiras = APPS_PADRAO.filter((a) => a.carteira && (android || ehAndroidWeb() ? a.pacote : ehIphone() ? !a.pacote : true));
  const bancos = useMemo(() => {
    const base: AppEscolhido[] = [...APPS_PADRAO.filter((a) => !a.carteira), ...valor.filter((v) => !APPS_PADRAO.some((p) => chave(p) === chave(v)))];
    const vistos = new Set<string>();
    return base.filter((a) => !vistos.has(chave(a)) && vistos.add(chave(a)));
  }, [valor]);
  const achados = busca.trim().length >= 2 ? instalados.filter((a) => a.nome.toLowerCase().includes(busca.trim().toLowerCase()) && !marcados.has(a.pacote)).slice(0, 8) : [];

  const caixa = (a: AppEscolhido) => {
    const p = APPS_PADRAO.find((x) => chave(x) === chave(a) || x.nome === a.nome);
    return (
      <label key={chave(a)} className="linha pequeno" style={{ gap: 10, alignItems: 'center' }}>
        <input type="checkbox" checked={marcados.has(chave(a))} onChange={() => alternar(a)} style={{ width: 20, height: 20, accentColor: 'var(--terracota)' }} />
        <IconeMarca icone={p?.icone} sigla={p?.sigla ?? a.nome.slice(0, 2)} cor={p?.cor ?? '#5F7A5A'} nome={a.nome} tamanho={30} />
        {a.nome}
      </label>
    );
  };

  return (
    <div className="coluna" style={{ gap: 10 }}>
      <strong className="pequeno">Pagamento por aproximação</strong>
      {carteiras.map(caixa)}
      <strong className="pequeno">Bancos e apps de pagamento</strong>
      {bancos.map(caixa)}
      {android && ignorados.filter((a) => !marcados.has(a.pacote)).length > 0 && (
        <>
          <strong className="pequeno">Mandaram avisos com valor neste celular</strong>
          {ignorados.filter((a) => !marcados.has(a.pacote)).map((a) => caixa(a))}
        </>
      )}
      {android ? (
        <label className="campo">
          Outro app de pagamento
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
            Outro app de pagamento
            <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do app" autoComplete="off" maxLength={40} />
          </label>
          <button type="button" className="botao secundario pequeno" disabled={!novoNome.trim()} onClick={() => { alternar({ nome: novoNome.trim() }); setNovoNome(''); }}>
            Adicionar
          </button>
        </div>
      )}
    </div>
  );
}

/** Grava a escolha na conta e no leitor do Android. */
export async function salvarApps(lista: AppEscolhido[]) {
  await db.perfil.update('eu', { appsPagamento: lista });
  if (ehAppAndroid()) await Leitor.definirApps({ pacotes: lista.filter((a) => a.pacote).map((a) => a.pacote!) }).catch(() => undefined);
}

/** Ajustes: quais apps de pagamento o Meus Planos pode ler (o resto é ignorado). */
export function AppsPagamento({ perfil, aoSalvar }: { perfil: Perfil; aoSalvar: (m: string) => void }) {
  const [escolhidos, setEscolhidos] = useState<AppEscolhido[]>(() => listaDeApps(perfil));
  return (
    <section className="cartao" id="apps-pagamento">
      <h2 style={{ fontSize: 15, fontWeight: 800 }}>Apps de pagamento que o app lê</h2>
      <p className="mini suave">Só os avisos dos apps marcados viram lançamentos. Avisos de outros apps (cotação do dólar, notícias, redes sociais) são ignorados.</p>
      <EscolherApps valor={escolhidos} aoMudar={setEscolhidos} />
      <BotaoSalvar
        className="botao pequeno"
        aoSalvar={async () => {
          await salvarApps(escolhidos);
          aoSalvar(escolhidos.length ? 'Apps de pagamento salvos.' : 'Nenhum app marcado: os avisos de pagamento não serão lidos.');
        }}
      >
        Salvar apps
      </BotaoSalvar>
    </section>
  );
}

/** Início: aparece até a pessoa escolher os apps de pagamento que usa. */
export function CartaoEscolherApps({ perfil }: { perfil?: Perfil }) {
  const [aberta, setAberta] = useState(false);
  const [escolhidos, setEscolhidos] = useState<AppEscolhido[]>([]);
  if (!perfil || (escolheuApps(perfil) && !aberta)) return null;
  return (
    <>
      <button type="button" className="cartao terracota cartao-link" style={{ gridColumn: '1 / -1', flexDirection: 'row', alignItems: 'center', textAlign: 'left', border: 0, cursor: 'pointer' }} onClick={() => setAberta(true)}>
        <span className="circulo" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}><Icone nome="sino" /></span>
        <span className="cresce coluna" style={{ gap: 2 }}>
          <strong>Escolha os apps de pagamento que você usa</strong>
          <span className="pequeno">Seu banco e sua carteira (Apple Wallet, Samsung Wallet, Carteira do Google). Só os avisos deles viram lançamentos.</span>
        </span>
        <Icone nome="direita" />
      </button>
      <Folha aberta={aberta} aoFechar={() => setAberta(false)} titulo="Apps de pagamento">
        <EscolherApps valor={escolhidos} aoMudar={setEscolhidos} />
        <BotaoSalvar disabled={!escolhidos.length} aoSalvar={() => salvarApps(escolhidos)} depois={() => setAberta(false)}>
          Salvar ({escolhidos.length})
        </BotaoSalvar>
      </Folha>
    </>
  );
}
