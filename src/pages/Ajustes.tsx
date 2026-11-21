import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import { Folha, Segmentado } from '../components/Ui';
import { CriarSenha, TecladoPin } from '../components/Bloqueio';
import { EditarRenda } from '../components/EditarRenda';
import { AjustesCartao, AjustesContato, TrocarSenha } from '../components/AjustesExtras';
import { PedidosConvite } from '../components/PedidosConvite';
import { ativarBiometria, biometriaDisponivel, cifrar, conferirPin, decifrar, definirTempo, lerBloqueio, removerBiometria, type ConfigBloqueio } from '../lib/bloqueio';
import { db, exportarTudo, importarTudo, type Tema } from '../db';
import { useDados } from '../hooks';
import { entrarDeNovo, sairDaConta } from '../lib/conjunto';
import { ehAppAndroid, Leitor } from '../lib/nativo';

export default function Ajustes() {
  const navegar = useNavigate();
  const { perfil } = useDados();
  const [salvo, setSalvo] = useState('');
  const [leitura, setLeitura] = useState<{ permitido: boolean; avisosPermitidos: boolean }>();
  const [seguranca, setSeguranca] = useState<ConfigBloqueio>();
  const [temBio, setTemBio] = useState(false);
  const [pedirPin, setPedirPin] = useState<'exportar' | 'restaurar' | 'trocar'>();
  const [restaurando, setRestaurando] = useState<string>();
  const [criando, setCriando] = useState(false);
  const [pin, setPin] = useState('');
  const [erroPin, setErroPin] = useState('');
  const recarregarSeguranca = () => lerBloqueio().then(setSeguranca);

  useEffect(() => {
    recarregarSeguranca();
    biometriaDisponivel().then(setTemBio);
  }, []);
  useEffect(() => {
    if (restaurando) setPedirPin('restaurar');
  }, [restaurando]);

  useEffect(() => {
    if (pin.length !== 6 || !pedirPin) return;
    (async () => {
      const r = await conferirPin(pin);
      setPin('');
      if (!r.ok) {
        setErroPin(r.travadoAte ? 'Muitas tentativas. Aguarde um pouco.' : `Senha incorreta. ${r.restantes} tentativas.`);
        return;
      }
      setErroPin('');
      const acao = pedirPin;
      setPedirPin(undefined);
      if (acao === 'exportar') await baixarBackup(pin);
      if (acao === 'trocar') setCriando(true);
      if (acao === 'restaurar' && restaurando) {
        try {
          await importarTudo(JSON.parse(await decifrar(restaurando, pin)));
          aviso('Dados restaurados.');
        } catch {
          aviso('Não foi possível abrir a cópia. Ela precisa ser restaurada com a senha usada quando foi salva.');
        }
        setRestaurando(undefined);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  useEffect(() => {
    if (!ehAppAndroid()) return;
    const ver = () => Leitor.status().then(setLeitura).catch(() => undefined);
    ver();
    document.addEventListener('visibilitychange', ver);
    return () => document.removeEventListener('visibilitychange', ver);
  }, []);


  const aviso = (t: string) => {
    setSalvo(t);
    setTimeout(() => setSalvo(''), 2500);
  };


  async function baixarBackup(senha?: string) {
    const dados = JSON.stringify(await exportarTudo());
    const conteudo = senha ? await cifrar(dados, senha) : dados;
    const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }));
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
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>Segurança</h2>
        {seguranca?.ativo ? (
          <>
            <div className="entre pequeno"><span>Senha do app</span><strong>Ativada</strong></div>
            <div className="entre pequeno"><span>Digital ou rosto</span><strong>{seguranca.biometria ? 'Ativado' : temBio ? 'Desativado' : 'Indisponível neste aparelho'}</strong></div>
            <span className="campo" style={{ marginBottom: 0 }}>Bloquear depois de sair do app</span>
            <Segmentado
              rotulo="Tempo para bloquear"
              valor={String(seguranca.bloquearApos)}
              aoMudar={async (v) => { await definirTempo(Number(v)); recarregarSeguranca(); }}
              opcoes={[{ valor: '0', rotulo: 'Na hora' }, { valor: '30', rotulo: '30 s' }, { valor: '60', rotulo: '1 min' }, { valor: '300', rotulo: '5 min' }]}
            />
            <div className="grade-2">
              <button type="button" className="botao secundario pequeno" onClick={() => setPedirPin('trocar')}>Trocar senha</button>
              {temBio && (
                <button
                  type="button"
                  className="botao secundario pequeno"
                  onClick={async () => {
                    try {
                      if (seguranca.biometria) await removerBiometria();
                      else await ativarBiometria();
                      recarregarSeguranca();
                    } catch (e) {
                      aviso((e as Error).message);
                    }
                  }}
                >
                  {seguranca.biometria ? 'Desligar biometria' : 'Ligar biometria'}
                </button>
              )}
            </div>
            <p className="mini suave">Esqueceu a senha? Por segurança não há como recuperar: é preciso apagar os dados e restaurar uma cópia.</p>
          </>
        ) : (
          <>
            <p className="pequeno">O app está sem senha. Qualquer pessoa com o seu celular desbloqueado consegue abrir.</p>
            <button type="button" className="botao pequeno" onClick={() => setCriando(true)}>Criar senha</button>
          </>
        )}
      </section>

      {ehAppAndroid() && (
        <section className="cartao">
          <h2 style={{ fontSize: 15, fontWeight: 800 }}>Leitura de notificações</h2>
          <div className="entre pequeno"><span>Ler avisos de pagamento</span><strong>{leitura?.permitido ? 'Ativada' : 'Desativada'}</strong></div>
          <div className="entre pequeno"><span>Perguntar o lugar na hora</span><strong>{leitura?.avisosPermitidos ? 'Ativado' : 'Desativado'}</strong></div>
          <p className="mini suave">O app lê só avisos com valores em R$ de pagamento ou de dinheiro recebido. Os outros avisos são ignorados na hora e nada do texto é guardado.</p>
          {!leitura?.permitido && <button type="button" className="botao pequeno" onClick={() => Leitor.abrirPermissao()}>Ativar leitura</button>}
          {leitura && !leitura.avisosPermitidos && (
            <button type="button" className="botao secundario pequeno" onClick={async () => setLeitura({ ...leitura, ...(await Leitor.pedirPermissaoAvisos()) })}>Permitir avisos do app</button>
          )}
        </section>
      )}

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
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>Renda mensal</h2>
        {perfil && <EditarRenda key={perfil.rendaAtualizadaEm} perfil={perfil} aoSalvar={() => aviso('Renda atualizada. Os planos foram recalculados.')} />}
      </section>

      <PedidosConvite />

      {perfil && <AjustesCartao key={`c${perfil.limiteUsadoEm}`} perfil={perfil} aoSalvar={aviso} />}
      {perfil && <AjustesContato perfil={perfil} aoSalvar={aviso} />}

      <section className="cartao">
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>Acesso</h2>
        <p className="mini suave">O app só abre para e-mails convidados, com a sua conta (e-mail e senha). A sessão dura 30 dias e se renova sozinha enquanto você usa. Se a análise com IA ou o plano em conjunto avisarem que a sessão expirou, toque em "Entrar de novo".</p>
        <div className="grade-2">
          <button type="button" className="botao secundario pequeno" onClick={entrarDeNovo} disabled={!navigator.onLine}>Entrar de novo</button>
          <button
            type="button"
            className="botao secundario pequeno"
            disabled={!navigator.onLine}
            onClick={() => confirm('Sair da conta neste aparelho? Seus dados continuam guardados aqui; para voltar, entre com seu e-mail e senha.') && sairDaConta()}
          >
            Sair da conta
          </button>
        </div>
        <TrocarSenha aoSalvar={aviso} />
      </section>

      <section className="cartao">
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>Cópia de segurança</h2>
        <p className="mini suave">Seus dados ficam só neste aparelho. Guarde uma cópia de vez em quando (por exemplo, no seu Google Drive ou iCloud) para não perder nada se trocar de celular. A cópia sai cifrada com a sua senha do app: sem a senha, ninguém consegue ler o arquivo.</p>
        <div className="grade-2">
          <button type="button" className="botao secundario pequeno" onClick={() => (seguranca?.ativo ? setPedirPin('exportar') : baixarBackup())}><Icone nome="baixar" /> Salvar cópia</button>
          <label className="botao secundario pequeno" style={{ cursor: 'pointer' }}>
            <Icone nome="upload" /> Restaurar
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f || !confirm('Restaurar substitui todos os dados atuais por os da cópia. Continuar?')) return;
                const texto = await f.text();
                if (texto.includes('meus-planos-cifrado-1')) {
                  setRestaurando(texto);
                  return;
                }
                try {
                  await importarTudo(JSON.parse(texto));
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
      <Folha aberta={!!pedirPin} aoFechar={() => { setPedirPin(undefined); setRestaurando(undefined); setPin(''); }} titulo="Confirme sua senha">
        <p className="pequeno suave" role="status" style={{ textAlign: 'center', minHeight: 20 }}>
          {erroPin || (pedirPin === 'restaurar' ? 'Digite a senha do app usada quando a cópia foi salva.' : 'Digite a senha do app para continuar.')}
        </p>
        <TecladoPin valor={pin} aoMudar={setPin} />
      </Folha>
      <Folha aberta={criando} aoFechar={() => setCriando(false)} titulo={seguranca?.ativo ? 'Nova senha' : 'Criar senha'}>
        <CriarSenha atual={seguranca} aoConcluir={() => { setCriando(false); recarregarSeguranca(); aviso('Senha salva.'); }} />
      </Folha>
    </main>
  );
}
