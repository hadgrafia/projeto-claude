import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import { CampoDinheiro, Segmentado } from '../components/Ui';
import { db, exportarTudo, importarTudo, type Tema } from '../db';
import { useDados } from '../hooks';
import { mesLongo, ultimosMeses } from '../lib/format';
import { lerConfigIA, salvarConfigIA } from '../lib/ia';

export default function Ajustes() {
  const navegar = useNavigate();
  const { perfil } = useDados();
  const meses = ultimosMeses(6);
  const [renda, setRenda] = useState<(number | undefined)[]>([]);
  const [gasto, setGasto] = useState<number>();
  const [ia, setIa] = useState({ url: '', token: '' });
  const [salvo, setSalvo] = useState('');

  useEffect(() => {
    if (!perfil) return;
    const m = new Map(perfil.rendaMeses.map((r) => [r.mes, r.valor]));
    setRenda(meses.map((k) => m.get(k)));
    setGasto(perfil.gastoMensalEstimado || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.id]);
  useEffect(() => {
    lerConfigIA().then(setIa);
  }, []);

  const aviso = (t: string) => {
    setSalvo(t);
    setTimeout(() => setSalvo(''), 2500);
  };

  async function salvarRenda() {
    if (!perfil) return;
    const outros = perfil.rendaMeses.filter((r) => !meses.includes(r.mes));
    await db.perfil.update('eu', {
      rendaMeses: [...outros, ...meses.map((mes, i) => ({ mes, valor: renda[i] ?? 0 })).filter((r) => r.valor > 0)],
      gastoMensalEstimado: gasto ?? 0,
    });
    aviso('Renda atualizada.');
  }

  async function baixarBackup() {
    const dados = await exportarTudo();
    const url = URL.createObjectURL(new Blob([JSON.stringify(dados)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `meus-planos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="tela sem-nav">
      <div className="linha">
        <button type="button" className="circulo escuro" aria-label="Voltar" onClick={() => navegar('/inicio')}><Icone nome="voltar" /></button>
        <h1 className="titulo" style={{ fontSize: 24 }}>Ajustes</h1>
      </div>
      {salvo && <p className="cartao manter pequeno" role="status">{salvo}</p>}

      <section className="cartao">
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>Tema</h2>
        <Segmentado<Tema>
          rotulo="Tema"
          valor={perfil?.tema ?? 'sistema'}
          aoMudar={(t) => db.perfil.update('eu', { tema: t })}
          opcoes={[{ valor: 'claro', rotulo: 'Claro' }, { valor: 'escuro', rotulo: 'Escuro' }, { valor: 'sistema', rotulo: 'Automático' }]}
        />
      </section>

      <section className="cartao">
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>Renda dos últimos 6 meses</h2>
        <p className="mini suave">Meses com entradas detectadas usam o valor detectado. Aqui você completa os outros.</p>
        <div className="grade-2">
          {meses.map((m, i) => (
            <CampoDinheiro key={m} rotulo={mesLongo(m).replace(/^./, (c) => c.toUpperCase())} valor={renda[i]} aoMudar={(v) => setRenda((r) => meses.map((_, j) => (j === i ? v : r[j])))} />
          ))}
        </div>
        <CampoDinheiro rotulo="Gasto mensal estimado" valor={gasto} aoMudar={setGasto} />
        <button type="button" className="botao pequeno" onClick={salvarRenda}>Salvar</button>
      </section>

      <section className="cartao">
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>Análise com IA</h2>
        <p className="mini suave">Quem administra o app passa o endereço e o código de acesso. Sem eles, todo o resto do app funciona normalmente.</p>
        <label className="campo">Endereço do servidor
          <input value={ia.url} onChange={(e) => setIa({ ...ia, url: e.target.value })} placeholder="https://…workers.dev" inputMode="url" />
        </label>
        <label className="campo">Código de acesso
          <input value={ia.token} onChange={(e) => setIa({ ...ia, token: e.target.value })} type="password" autoComplete="off" />
        </label>
        <button type="button" className="botao pequeno" onClick={async () => { await salvarConfigIA(ia); aviso('Análise com IA configurada.'); }}>Salvar</button>
      </section>

      <section className="cartao">
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>Cópia de segurança</h2>
        <p className="mini suave">Seus dados ficam só neste aparelho. Guarde uma cópia de vez em quando (por exemplo, no seu Google Drive ou iCloud) para não perder nada se trocar de celular.</p>
        <div className="grade-2">
          <button type="button" className="botao secundario pequeno" onClick={baixarBackup}><Icone nome="baixar" /> Salvar cópia</button>
          <label className="botao secundario pequeno" style={{ cursor: 'pointer' }}>
            <Icone nome="upload" /> Restaurar
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f || !confirm('Restaurar substitui todos os dados atuais por os da cópia. Continuar?')) return;
                try {
                  await importarTudo(JSON.parse(await f.text()));
                  aviso('Dados restaurados.');
                } catch {
                  aviso('Arquivo de cópia inválido.');
                }
              }}
            />
          </label>
        </div>
      </section>

      <section className="cartao areia">
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>Instalar no celular</h2>
        <p className="pequeno"><strong>iPhone:</strong> abra no Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.</p>
        <p className="pequeno"><strong>Android:</strong> no Chrome, toque no menu ⋮ e em “Instalar app”.</p>
        <p className="mini suave">Depois de instalado, o app abre e funciona sem internet.</p>
      </section>

      <section className="cartao verde">
        <div className="linha" style={{ alignItems: 'flex-start' }}>
          <Icone nome="escudo" cor="#D9774F" />
          <p className="pequeno">Privacidade: o app nunca acessa o app do seu banco, não pede senhas e não envia seus gastos para nenhum servidor. A análise com IA, quando você pede, recebe só os números do plano.</p>
        </div>
      </section>

      <button
        type="button"
        className="botao perigo"
        onClick={async () => {
          if (confirm('Apagar TODOS os dados deste aparelho? Faça uma cópia antes se quiser guardar.')) {
            await db.delete();
            location.reload();
          }
        }}
      >
        <Icone nome="lixo" /> Apagar todos os dados
      </button>
    </main>
  );
}
