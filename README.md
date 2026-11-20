# Meus Planos Financeiros

App de planejamento financeiro pessoal. Cada pessoa cria quantos planos quiser ("Casa Nova", "Comprar Equipamentos", "Carro"…), cada um com sua meta, e o app acompanha gastos, entradas e investimentos para dizer quanto separar, onde guardar e quando cada plano fica pronto.

- **Funciona sem internet**: depois de aberto uma vez, o app inteiro fica guardado no aparelho (PWA). Todas as telas abrem e respondem offline.
- **Privado**: todos os dados ficam só no celular da pessoa (IndexedDB). O app nunca acessa o app do banco nem pede senha. Os gastos chegam pelo extrato que a pessoa envia (PDF, OFX ou CSV), por registro manual e, no app Android, pelas notificações de pagamento.
- **Android e iPhone**: a mesma versão web é instalada pela tela inicial (Safari: Compartilhar → Adicionar à Tela de Início; Chrome: ⋮ → Instalar app).
- **Tema claro e escuro**, com animações (respeita a opção "reduzir movimento" do sistema).

## O que tem no app

| Tela | O que faz |
|---|---|
| Boas-vindas | Privacidade, forma de registrar gastos, nome, tema, renda dos últimos 6 meses, gasto estimado, perfil de investidor (3 perguntas) e primeiro plano |
| Início | Total guardado, planos, renda média de 6 meses (variável: PJ e freela), valor livre por mês |
| Gastos | Visão por dia, semana, mês ou ano, sem restrição de horário; entradas e saídas; categorias automáticas; anotar e editar |
| Enviar extrato | Lê PDF, OFX e CSV **no próprio aparelho**, sem enviar o arquivo para lugar nenhum; ignora duplicados |
| Planos | Porcentagem fixa do valor livre para cada plano; previsão com rendimento; aporte necessário para cumprir o prazo |
| Plano | Meta calculada pelo questionário de cada tipo, custo mensal depois, onde guardar o dinheiro, links de compra, análise com IA |
| Investir | Carteira (cofrinhos, CDB, Tesouro, LCI/LCA, ações, cripto…), aportes mensais ou anuais, Selic do Banco Central, comparação de rendimentos, alocação por plano conforme prazo e perfil, reserva de emergência, planejamento com IA |
| Feedback | Manter / Rever / Cortar por categoria, quanto rende para os planos e como muda a previsão de cada um |
| Ajustes | Tema, renda, código da IA, cópia de segurança, instalar, apagar dados |

### Plano Casa Nova (São Paulo)
Referências usadas no cálculo (cada valor pode ser trocado pela pessoa):
- Aluguel: Índice FipeZap de locação, set/2026: R$ 65,78/m² (mais 15% para mobiliado, estimativa)
- Alimentação: cesta básica DIEESE em SP, jul/2026: R$ 915,01, mais limpeza e higiene
- Transporte: ônibus R$ 5,30, metrô R$ 5,40 e integração R$ 9,38 (jan/2026), 44 viagens por mês
- Reserva de emergência de 6 meses e caução de até 3 aluguéis (Lei do Inquilinato, art. 38)

Para um studio mobiliado de 30 m², isso dá cerca de **R$ 5.200 por mês** e uma meta de cerca de **R$ 40.600**.

## Rodar no computador

```bash
npm install
npm run dev      # abre em http://localhost:5173
npm test         # testes dos cálculos, extratos e notificações
npm run build    # gera a versão final em dist/
```

## Publicar de graça e com acesso restrito

1. Crie uma conta gratuita na Cloudflare e, em **Workers & Pages → Pages**, conecte este repositório. Comando de build: `npm run build`; pasta: `dist`.
2. Em **Zero Trust → Access → Applications**, proteja o endereço do app com uma lista de e-mails permitidos. É grátis para até 50 pessoas: só quem estiver na lista consegue abrir e instalar o app.

## Análise com IA (opcional)

A pasta `worker/` tem um servidor pequeno (Cloudflare Worker, gratuito) que guarda a chave da API do Claude e faz a pesquisa na web. O app envia só os números do plano: nunca nome, banco, extrato ou lista de gastos.

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # chave da API do Claude (console.anthropic.com)
npx wrangler secret put APP_TOKEN           # um código que você passa para as pessoas convidadas
npx wrangler deploy
```

Depois, no app, vá em **Ajustes → Análise com IA** e informe o endereço do worker e o código. Para não precisar digitar o endereço, gere o app com `VITE_IA_URL=https://seu-worker.workers.dev npm run build`.

**Custo:** o servidor é gratuito, mas a API do Claude cobra por uso (modelo Claude Opus 5.5 com pesquisa na web). Cada análise custa poucos centavos de dólar; acompanhe o gasto no console da Anthropic.

## Nome do lugar de cada gasto

Todo lançamento mostra **onde** o dinheiro foi gasto (loja, estabelecimento ou pessoa do Pix) ou de quem veio, nas entradas.
- O lugar é lido da notificação ou do extrato. Prefixos de maquininha e intermediadores (`PG *`, `MERCADOPAGO*` etc.) são removidos.
- Se não der para identificar, o app pergunta **"Onde foi este gasto?"**:
  - **No app Android:** no mesmo instante do pagamento, com uma notificação que tem campo de resposta, sem precisar abrir o app.
  - **Em qualquer versão:** assim que o app é aberto, com sugestões dos lugares mais usados.
- Com o nome informado, a categoria é ajustada automaticamente e o Feedback mostra onde você mais gastou em cada categoria.

## App Android (leitura de notificações)

A pasta `android/` é o mesmo app empacotado com o Capacitor, mais um serviço nativo que lê os avisos de pagamento de **qualquer banco ou app**. O app nunca abre nem acessa o app do banco. Avisos sem valor em R$ de pagamento ou de dinheiro recebido são ignorados na hora, e o texto das notificações não é guardado.

O GitHub gera o APK sozinho a cada envio de código (`.github/workflows/android.yml`): em **Actions → App Android → Artifacts → meus-planos-apk**. Para instalar no celular, permita "instalar apps desconhecidos" para o navegador ou para o gerenciador de arquivos. No primeiro uso, escolha "Ler notificações de pagamento" e ative o Meus Planos na tela de acesso a notificações que o Android abre.

No iPhone, a Apple não permite ler notificações de outros apps: lá o registro é pelo extrato ou manual.

## Estrutura

```
src/
  db.ts            banco local (IndexedDB) e cópia de segurança
  lib/             cálculos: finanças, planos, investimentos, feedback, extratos, notificações, IA, FIPE
  pages/           telas
  components/      ícones e componentes animados
worker/            servidor da análise com IA
```
