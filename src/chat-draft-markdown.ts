import MarkdownIt from 'markdown-it';

// html:false basta como frontera de confianza (markdown-it escapa HTML crudo en vez de dejarlo pasar), sin sumar un sanitizador aparte.
const renderer = new MarkdownIt({ html: false, linkify: true });

// D15 (correcciones-qa-gauntlet Hito 11): markdown-it descarta un backtick suelto que nunca encuentra su cierre (lo trata como delimitador de codigo inline fallido) en vez de mostrarlo como texto literal. Mismo algoritmo de emparejamiento de CommonMark: cada corrida de backticks abre buscando la SIGUIENTE corrida de igual longitud como cierre; si no la encuentra, esa corrida es texto literal.
export function neutralizeUnpairedBackticks(text: string): string {
  const runs: { start: number; end: number; length: number }[] = [];
  const regex = /`+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    runs.push({
      start: match.index,
      end: match.index + match[0].length,
      length: match[0].length,
    });
  }

  const literalRunIndexes = new Set<number>();
  let i = 0;
  while (i < runs.length) {
    let closerIndex = -1;
    for (let j = i + 1; j < runs.length; j++) {
      if (runs[j].length === runs[i].length) {
        closerIndex = j;
        break;
      }
    }
    if (closerIndex === -1) {
      literalRunIndexes.add(i);
      i += 1;
    } else {
      i = closerIndex + 1;
    }
  }

  let result = '';
  let lastIndex = 0;
  runs.forEach((run, idx) => {
    result += text.slice(lastIndex, run.start);
    const raw = text.slice(run.start, run.end);
    result += literalRunIndexes.has(idx) ? raw.replace(/`/g, '&#96;') : raw;
    lastIndex = run.end;
  });
  result += text.slice(lastIndex);
  return result;
}

export function renderChatDraftMarkdown(text: string): string {
  return renderer.render(neutralizeUnpairedBackticks(text));
}
