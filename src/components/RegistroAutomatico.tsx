import { useState } from 'react';
import { ehAppAndroid } from '../lib/nativo';

/**
 * Guia para registrar gastos quase sozinho quando o app é usado pelo navegador
 * (o sistema não deixa nenhum site ler notificações). No app Android, a leitura é direta.
 */
const BASE = `${location.origin}/app/#/lancar`;
const LINK_ANDROID = `${BASE}?app=Banco&texto=TEXTO_DA_NOTIFICACAO`;
const LINK_IPHONE = `${BASE}?valor=VALOR&local=COMERCIANTE&origem=Apple%20Pay`;

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="coluna" style={{ gap: 6 }}>
      <code className="mini" style={{ wordBreak: 'break-all', background: 'var(--bg)', padding: 10, borderRadius: 12 }}>{texto}</code>
      <button
        type="button"
        className="botao secundario pequeno"
        onClick={() => navigator.clipboard.writeText(texto).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        })}
      >
        {ok ? 'Link copiado' : 'Copiar o link'}
      </button>
    </div>
  );
}

export function RegistroAutomatico() {
  if (ehAppAndroid()) return null; // no app Android, as notificações já são lidas direto
  return (
    <section className="cartao">
      <h2 style={{ fontSize: 15, fontWeight: 800 }}>Registrar gastos sozinho</h2>
      <p className="mini suave">
        Pelo navegador, o celular não deixa nenhum site ler notificações (é uma proteção do Android e do iPhone). Estes caminhos deixam o registro quase automático: o gasto chega preenchido e você só confirma.
        Tudo é lido aqui no aparelho.
      </p>

      <details open>
        <summary className="pequeno" style={{ cursor: 'pointer', fontWeight: 700 }}>1. Compartilhar o comprovante (Android)</summary>
        <ol className="pequeno" style={{ paddingLeft: 20, margin: '8px 0 0' }}>
          <li>Instale o app pelo navegador (cartão "Instale o app" no Início).</li>
          <li>Depois de pagar, no app do banco, toque em <strong>Compartilhar comprovante</strong> e escolha <strong>Meus Planos</strong>.</li>
          <li>O app lê o valor e o lugar. Confira e toque em Salvar.</li>
        </ol>
        <p className="mini suave">Funciona com comprovante em PDF ou em texto. Extratos (PDF, OFX ou CSV) compartilhados vão direto para "Enviar extrato".</p>
      </details>

      <details>
        <summary className="pequeno" style={{ cursor: 'pointer', fontWeight: 700 }}>2. Automação dos avisos do banco (Android)</summary>
        <ol className="pequeno" style={{ paddingLeft: 20, margin: '8px 0 0' }}>
          <li>Na Play Store, instale um app de automação gratuito (por exemplo, o <strong>MacroDroid</strong>). Vindo da Play Store, não precisa desligar nenhuma proteção.</li>
          <li>Crie uma regra com o gatilho <strong>notificação recebida</strong>, escolhendo os apps do seu banco e de pagamento.</li>
          <li>Como ação, escolha <strong>abrir um site (link)</strong> e cole o link abaixo. No lugar de <code>TEXTO_DA_NOTIFICACAO</code>, coloque a variável do app de automação que traz o texto da notificação.</li>
        </ol>
        <Copiar texto={LINK_ANDROID} />
        <p className="mini suave">A cada aviso de pagamento, o Meus Planos abre com o gasto preenchido pelo mesmo leitor do app Android. Avisos sem dinheiro, como códigos de segurança, são ignorados.</p>
      </details>

      <details>
        <summary className="pequeno" style={{ cursor: 'pointer', fontWeight: 700 }}>3. iPhone: app Atalhos (Apple Pay)</summary>
        <ol className="pequeno" style={{ paddingLeft: 20, margin: '8px 0 0' }}>
          <li>Abra o app <strong>Atalhos</strong> → <strong>Automação</strong> → nova automação de <strong>Transação</strong> (compras com os cartões da Carteira).</li>
          <li>Marque para executar sem perguntar e adicione a ação <strong>Abrir URL</strong> com o link abaixo.</li>
          <li>No lugar de <code>VALOR</code> e <code>COMERCIANTE</code>, coloque as variáveis da transação (valor e comerciante).</li>
        </ol>
        <Copiar texto={LINK_IPHONE} />
        <p className="mini suave">Vale para compras com Apple Pay. Pix e outros pagamentos: compartilhe o comprovante (no iPhone, copie o texto do comprovante) ou anote em dois toques.</p>
      </details>
    </section>
  );
}
