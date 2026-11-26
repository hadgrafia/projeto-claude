import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import { Segmentado } from '../components/Ui';
import { souAdmin } from '../lib/pedidos';

/**
 * Estatística de uso (só a administradora): o que as pessoas mais usam, sem identificar ninguém.
 * Medida: "pessoas-dia" = soma, dia a dia, de quantas contas usaram o recurso.
 * A porcentagem compara com as pessoas ativas nos mesmos dias.
 */
interface Dados {
  dias: number;
  contas: number;
  contasNovas: number;
  pedidosPendentes: number;
  recursos: { recurso: string; total: number; diasComUso: number }[];
  ativosPorDia: { dia: string; contas: number }[];
}

const NOMES: Record<string, string> = {
  'tela:inicio': 'Início',
  'tela:gastos': 'Gastos',
  'tela:planos': 'Lista de planos',
  'tela:plano': 'Ver um plano',
  'planos:criar': 'Criar plano',
  'planos:editar': 'Editar plano',
  'tela:investir': 'Investimentos',
  'tela:conselhos': 'Conselhos (onde cortar)',
  'antes-de-comprar': 'Vai fazer uma compra?',
  cartao: 'Cartão de crédito',
  assinaturas: 'Assinaturas',
  'tela:agentes': 'Chat dos agentes',
  'enviar-extrato': 'Enviar extrato',
  'lancamento-rapido': 'Lançamento rápido (comprovante/atalho)',
  duvidas: 'Dúvidas',
  'tela:ajustes': 'Ajustes',
  'pj:das-e-notas': 'Impostos e notas (PJ)',
  'olho-valores': 'Olho (esconder valores)',
  'guia:gerado': 'Guia do plano',
  'agente:nina': 'Nina (gastos)',
  'agente:gabriela': 'Gabriela (planos)',
  'agente:matheus': 'Matheus (investimentos)',
  'agente:leo': 'Leo (compras e cartão)',
  'agente:lari': 'Lari (assinaturas)',
  'agente:gui': 'Gui (guia dos planos)',
  'agente:anexo-audio': 'Agentes: áudio',
  'agente:anexo-image': 'Agentes: foto',
  'agente:anexo-application': 'Agentes: PDF',
  'plano:casa': 'Casa',
  'plano:carro': 'Carro',
  'plano:viagem': 'Viagem',
  'plano:equipamentos': 'Equipamentos',
  'plano:outro': 'Outro objetivo',
  'planos:0': 'Nenhum plano',
  'planos:1': '1 plano',
  'planos:2': '2 planos',
  'planos:3-ou-mais': '3 ou mais planos',
  'plano-com-data': 'Plano com data desejada',
  'plano-em-conjunto': 'Plano em conjunto',
  'usa:cartao': 'Controla o cartão',
  'usa:assinaturas': 'Cadastrou assinaturas',
  'usa:investimentos': 'Cadastrou investimentos',
  'usa:bloqueio-do-app': 'Bloqueio do app ligado',
  'registro:notificacoes': 'Escolheu: avisos do banco',
  'registro:extrato': 'Escolheu: extrato',
  'registro:manual': 'Escolheu: anotar à mão',
  'gastos:avisos-do-banco': 'Registrou pelos avisos do banco',
  'gastos:extrato': 'Registrou por extrato',
  'gastos:a-mao': 'Registrou à mão',
  'vinculo:clt': 'CLT',
  'vinculo:pj': 'PJ',
  'vinculo:autonomo': 'Autônomo ou freelancer',
  'vinculo:servidor': 'Servidor público',
  'vinculo:outro': 'Outro tipo de renda',
  'aparelho:app-android': 'App Android',
  'aparelho:android-navegador': 'Android pelo navegador',
  'aparelho:iphone': 'iPhone',
  'aparelho:computador': 'Computador',
};
const ACOES: Record<string, string> = {
  registrar: 'registrar gasto',
  avaliar_compra: 'avaliar compra',
  criar_plano: 'criar plano',
  relatorio: 'planilha',
  resumo: 'resumo do mês',
  imposto: 'imposto de renda',
  renda: 'atualizar renda',
  guardar: 'guardar no plano',
  porcentagem: 'mudar porcentagem',
  investimento: 'investimento',
  cartao: 'cartão',
  assinatura: 'assinatura',
  tela: 'mostrar tela',
};
const nome = (r: string) => NOMES[r] ?? (r.startsWith('acao:') ? `Agentes pediram: ${ACOES[r.slice(5)] ?? r.slice(5)}` : r);

const GRUPOS: { titulo: string; dica: string; filtro: (r: string) => boolean }[] = [
  { titulo: 'Recursos mais usados', dica: 'Telas e funções abertas.', filtro: (r) => /^(tela:|planos:criar|planos:editar|antes-de-comprar|cartao$|assinaturas$|enviar-extrato|lancamento-rapido|duvidas|olho-valores|guia:)/.test(r) },
  { titulo: 'Prioridades: tipos de plano', dica: 'Quem tem cada tipo de plano.', filtro: (r) => r.startsWith('plano:') || r === 'plano-com-data' || r === 'plano-em-conjunto' },
  { titulo: 'Agentes', dica: 'Quem respondeu e o que as pessoas pediram.', filtro: (r) => r.startsWith('agente:') || r.startsWith('acao:') },
  { titulo: 'Como registram os gastos', dica: 'No mês corrente de cada dia.', filtro: (r) => r.startsWith('gastos:') || r.startsWith('registro:') },
  { titulo: 'O que já configuraram', dica: '', filtro: (r) => r.startsWith('usa:') || r.startsWith('planos:') && r !== 'planos:criar' && r !== 'planos:editar' },
  { titulo: 'Como recebem', dica: 'CLT, PJ, autônomo…', filtro: (r) => r.startsWith('vinculo:') },
  { titulo: 'Aparelhos', dica: '', filtro: (r) => r.startsWith('aparelho:') },
];

function Tile({ rotulo, valor, dica }: { rotulo: string; valor: string; dica?: string }) {
  return (
    <div className="cartao" style={{ gap: 2, padding: 14 }}>
      <span className="mini suave">{rotulo}</span>
      <strong className="num" style={{ fontSize: 26 }}>{valor}</strong>
      {dica && <span className="mini suave">{dica}</span>}
    </div>
  );
}

export default function Estatisticas() {
  const navegar = useNavigate();
  const [admin, setAdmin] = useState<boolean>();
  const [dias, setDias] = useState<'7' | '30' | '90'>('30');
  const [d, setD] = useState<Dados>();
  const [erro, setErro] = useState('');
  useEffect(() => {
    souAdmin().then(setAdmin).catch(() => setAdmin(false));
  }, []);
  useEffect(() => {
    if (!admin) return;
    setErro('');
    fetch(`/api/uso?dias=${dias}`, { credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Não foi possível carregar agora.');
        setD((await r.json()) as Dados);
      })
      .catch((e: Error) => setErro(navigator.onLine ? e.message : 'Conecte-se à internet para ver as estatísticas.'));
  }, [admin, dias]);

  const ativos = useMemo(() => d?.recursos.find((r) => r.recurso === 'ativo')?.total ?? 0, [d]);
  const mediaDia = d && d.ativosPorDia.length ? d.ativosPorDia.reduce((a, x) => a + x.contas, 0) / d.ativosPorDia.length : 0;

  if (admin === false) return <main className="tela sem-nav"><p className="vazio">Página não encontrada.</p></main>;
  return (
    <main className="tela sem-nav">
      <div className="topo">
        <div className="linha">
          <button type="button" className="circulo escuro" aria-label="Voltar" onClick={() => navegar(-1)}><Icone nome="voltar" /></button>
          <div className="coluna" style={{ gap: 2 }}>
            <h1 className="titulo" style={{ fontSize: 24 }}>Estatísticas de uso</h1>
            <span className="subtitulo">Só contagens. Ninguém é identificado.</span>
          </div>
        </div>
      </div>
      <Segmentado rotulo="Período" valor={dias} aoMudar={setDias} opcoes={[{ valor: '7', rotulo: '7 dias' }, { valor: '30', rotulo: '30 dias' }, { valor: '90', rotulo: '90 dias' }]} />
      {erro && <p className="cartao areia pequeno">{erro}</p>}
      {!d && !erro && <p className="vazio">Carregando…</p>}
      {d && (
        <>
          <div className="grade-2">
            <Tile rotulo="Contas criadas" valor={String(d.contas)} dica={`${d.contasNovas} nos últimos ${d.dias} dias`} />
            <Tile rotulo="Pessoas por dia (média)" valor={mediaDia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dica={d.ativosPorDia.length === 1 ? 'em 1 dia com uso' : `em ${d.ativosPorDia.length} dias com uso`} />
          </div>
          {ativos === 0 ? (
            <p className="cartao areia pequeno">Ainda não há uso registrado neste período. Os números aparecem conforme as pessoas abrem o app com a versão nova.</p>
          ) : (
            GRUPOS.map((g) => {
              const linhas = d.recursos.filter((r) => g.filtro(r.recurso)).sort((a, b) => b.total - a.total);
              if (!linhas.length) return null;
              const max = Math.max(...linhas.map((l) => l.total));
              return (
                <section key={g.titulo} className="cartao" style={{ gap: 10 }}>
                  <div className="coluna" style={{ gap: 2 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 800 }}>{g.titulo}</h2>
                    {g.dica && <span className="mini suave">{g.dica}</span>}
                  </div>
                  <div className="coluna" role="list" style={{ gap: 9 }}>
                    {linhas.map((l) => {
                      const pct = Math.round((l.total / ativos) * 100);
                      const texto = `${nome(l.recurso)}: ${pct}% das pessoas ativas (${l.total} pessoas-dia)`;
                      return (
                        <div key={l.recurso} role="listitem" className="coluna barra-estat" style={{ gap: 4 }} title={texto} aria-label={texto} tabIndex={0}>
                          <div className="entre pequeno">
                            <span>{nome(l.recurso)}</span>
                            <strong className="num">{pct}%</strong>
                          </div>
                          <div style={{ height: 8, borderRadius: 4, background: 'var(--areia-2)' }}>
                            <div style={{ width: `${Math.max(2, (l.total / max) * 100)}%`, height: '100%', borderRadius: 4, background: 'var(--terracota)' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
          <p className="mini suave">
            Como ler: a porcentagem é quantas das pessoas ativas no período usaram o recurso, somando dia a dia ("pessoas-dia"). Cada aparelho manda só nomes de recursos, uma vez por dia; o servidor guarda apenas os totais. Nenhum e-mail, valor ou texto é registrado.
          </p>
        </>
      )}
    </main>
  );
}
