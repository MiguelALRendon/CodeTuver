import { describe, expect, it } from 'vitest';
import {
  neutralizeUnpairedBackticks,
  renderChatDraftMarkdown,
} from './chat-draft-markdown';

describe('renderChatDraftMarkdown', () => {
  it('encabezado y parrafo en lineas separadas producen dos elementos distintos (caso literal del reporte)', () => {
    const html = renderChatDraftMarkdown('# title\n\npárrafo siguiente');
    expect(html).toContain('<h1>title</h1>');
    expect(html).toContain('<p>párrafo siguiente</p>');
  });

  it('renderiza una lista', () => {
    const html = renderChatDraftMarkdown('- uno\n- dos');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>uno</li>');
    expect(html).toContain('<li>dos</li>');
  });

  it('renderiza enfasis', () => {
    const html = renderChatDraftMarkdown('**negrita** y *cursiva*');
    expect(html).toContain('<strong>negrita</strong>');
    expect(html).toContain('<em>cursiva</em>');
  });

  it('renderiza codigo en linea', () => {
    const html = renderChatDraftMarkdown('usa `npm run build`');
    expect(html).toContain('<code>npm run build</code>');
  });

  it('renderiza un bloque de codigo', () => {
    const html = renderChatDraftMarkdown('```ts\nconst x = 1;\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('const x = 1;');
  });

  it('renderiza una tabla', () => {
    const html = renderChatDraftMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('un enlace autodetectado se reconoce (linkify)', () => {
    const html = renderChatDraftMarkdown('visita https://example.com');
    expect(html).toContain('<a href="https://example.com"');
  });

  it('HTML crudo en el borrador no llega al DOM como HTML (html:false)', () => {
    const html = renderChatDraftMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('un borrador vacio no lanza', () => {
    expect(renderChatDraftMarkdown('')).toBe('');
  });

  it('multiples fences sin cerrar de longitudes distintas (Hito 11, ninguna encuentra su par) conservan los backticks visibles, no desaparecen', () => {
    const html = renderChatDraftMarkdown('uno ` dos `` tres ``` cuatro');
    expect(html).toBe('<p>uno ` dos `` tres ``` cuatro</p>\n');
    expect(html).not.toContain('<code>');
  });

  it('un fence valido (con cierre) sigue renderizando como bloque de codigo, no regresiona', () => {
    const html = renderChatDraftMarkdown('```js\nconsole.log(1);\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('console.log(1);');
    expect(html).not.toContain('&#96;');
  });
});

describe('neutralizeUnpairedBackticks (correcciones-qa-gauntlet Hito 11)', () => {
  it('un solo backtick suelto (sin cierre) se neutraliza', () => {
    expect(neutralizeUnpairedBackticks('hola ` mundo')).toBe(
      'hola &#96; mundo',
    );
  });

  it('un par valido de backticks simples se preserva intacto', () => {
    expect(neutralizeUnpairedBackticks('usa `npm run build`')).toBe(
      'usa `npm run build`',
    );
  });

  it('texto sin ningun backtick no se altera', () => {
    expect(neutralizeUnpairedBackticks('texto normal sin nada raro')).toBe(
      'texto normal sin nada raro',
    );
  });
});
