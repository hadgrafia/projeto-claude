import { useState } from 'react';
import { Link } from 'react-router-dom';
import { db, type Plano } from '../db';
import { useOnline } from '../hooks';
import { marcarUso } from '../lib/uso';
import { Avatar } from './Equipe';
import { Entra, Markdown } from './Ui';

const TITULOS: Record<string, string> = {
  viagem: 'Melhor época, hospedagem, passeios, comida e experiências',
  casa: 'Bairros, melhor momento, documentos, custos e cuidados',
  carro: 'O modelo vale a pena, melhor época, custos e como comprar seguro',
  equipamentos: 'Melhores opções, melhor época, onde comprar e garantia',
  outro: 'Passo a passo, custos, melhor momento e cuidados',
};

/** Guia do plano: dicas pesquisadas em fontes confiáveis para realizar o plano antes de gastar. */
export function GuiaPlano({ plano }: { plano: Plano }) {
  const online = useOnline();
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const guia = plano.guia;

  async function gerar() {
    setErro('');
    setCarregando(true);
    try {
      const r = await fetch('/api/guia', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: plano.tipo, nome: plano.nome, prazo: plano.prazo, respostas: plano.respostas }),
      });
      const c = (await r.json().catch(() => ({}))) as { texto?: string; fontes?: { url: string; titulo: string }[]; geradoEm?: string; erro?: string };
      if (!r.ok || !c.texto) throw new Error(c.erro ?? 'Não consegui montar o guia agora.');
      const fontes = c.fontes?.length && !/##\s*Fontes/i.test(c.texto) ? `\n\n## Fontes consultadas\n${c.fontes.map((f) => `- [${f.titulo}](${f.url})`).join('\n')}` : '';
      await db.planos.update(plano.id!, { guia: { texto: c.texto + fontes, geradoEm: c.geradoEm ?? new Date().toISOString() } });
      marcarUso('guia:gerado', `guia:${plano.tipo}`);
    } catch (e) {
      setErro(navigator.onLine ? (e as Error).message : 'Precisa de internet para pesquisar.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <>
      <section className="cartao verde">
        <div className="linha">
          <Avatar id="gui" tamanho={44} />
          <div className="coluna cresce" style={{ gap: 2 }}>
            <strong>Guia do plano, com o Gui</strong>
            <span className="pequeno">{TITULOS[plano.tipo] ?? TITULOS.outro}. Pesquisado em fontes confiáveis, com os links.</span>
          </div>
        </div>
        <div className="grade-2">
          <button type="button" className="botao terracota pequeno" onClick={gerar} disabled={carregando || !online}>
            {carregando ? 'Pesquisando… (até 1 minuto)' : guia ? 'Atualizar guia' : online ? 'Montar guia' : 'Precisa de internet'}
          </button>
          <Link to="/agentes" state={{ texto: `Gui, sobre o meu plano "${plano.nome}": ` }} className="botao secundario pequeno" style={{ textAlign: 'center' }}>
            Perguntar ao Gui
          </Link>
        </div>
        {erro && <p className="pequeno">{erro}</p>}
      </section>
      {guia && (
        <Entra>
          <section className="cartao guia">
            <span className="mini suave">Guia de {new Date(guia.geradoEm).toLocaleString('pt-BR')} · disponível offline · confira datas e preços nos links antes de comprar</span>
            <Markdown texto={guia.texto} />
          </section>
        </Entra>
      )}
    </>
  );
}
