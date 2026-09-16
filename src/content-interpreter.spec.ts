import { afterEach, describe, expect, it } from 'vitest';
import fixture from '../docs/research/fixtures/10-formatos-markdown-codigo-diff-tabla-ascii.json';
import { renderChatDraftMarkdown } from './chat-draft-markdown';
import {
  armParseFault,
  createStreamBuffer,
  isMarkdownTextBlock,
  parseContentBlocks,
  pushStreamChunk,
} from './content-interpreter';

const ESC = '\x1b';

function readFixtureText(): string {
  return (fixture as { result: string }).result;
}

function makeThreeParagraphMessage(middle: string): string {
  return `Primer parrafo.\n\n${middle}\n\nTercer parrafo.`;
}

afterEach(() => {
  armParseFault(null);
});

describe('parseContentBlocks — casos adversos', () => {
  it('degrada a texto plano un bloque de codigo que nunca cierra la valla sin romper el parseo', () => {
    const text =
      'Antes del bloque.\n\n```typescript\nconst x = 1;\nfunction incompleta() {';

    const blocks = parseContentBlocks(text);

    expect(blocks).toHaveLength(2);
    expect(blocks[1].type).toBe('paragraph');
    expect((blocks[1] as { text: string }).text).toContain('```typescript');
    expect((blocks[1] as { text: string }).text).toContain(
      'function incompleta() {',
    );
  });

  it('conserva la fila completa y degrada la fila cortada de una tabla partida entre dos filas', () => {
    const text = '| Nombre | Edad |\n|---|---|\n| Ana | 30 |\n| Ju';

    const [block] = parseContentBlocks(text);

    expect(block).toEqual({
      type: 'table',
      headers: ['Nombre', 'Edad'],
      rows: [['Ana', '30'], ['Ju']],
    });
  });

  it('preserva el contenido truncado de una linea de diff cortada a la mitad sin romper el parseo', () => {
    const text =
      '```diff\n- const nombre = "Ernesto";\n+ const nombre = "Erne\n```';

    const [block] = parseContentBlocks(text);

    expect(block).toEqual({
      type: 'diff',
      additions: [{ content: 'const nombre = "Erne' }],
      deletions: [{ content: 'const nombre = "Ernesto";' }],
    });
  });

  it('reconstruye una secuencia ANSI de color partida entre dos fragmentos de streaming antes de interpretarla', () => {
    const state = createStreamBuffer();
    const first = pushStreamChunk(state, `hola ${ESC}[3`);

    expect(first.completedBlocks).toEqual([]);

    const second = pushStreamChunk(
      first.state,
      `2mmundo${ESC}[0m\n\ntexto siguiente`,
    );

    expect(second.completedBlocks).toEqual([
      { type: 'paragraph', text: 'hola mundo' },
    ]);
    expect(second.pendingText).toBe('texto siguiente');
  });

  it('Hallazgo 18 (qa-sesion-real-hallazgos.md): limpia codigos ANSI reales dentro de un fence sin lenguaje, formato cat -n', () => {
    const text = `\`\`\`\n1\tantes\n2\t${ESC}[31mROJO${ESC}[0m normal\n3\t${ESC}[32mVERDE${ESC}[1m negrita${ESC}[0m\n4\tdespues\n\`\`\``;

    const [block] = parseContentBlocks(text);

    expect(block).toEqual({
      type: 'ascii_art',
      content: '1\tantes\n2\tROJO normal\n3\tVERDE negrita\n4\tdespues',
    });
  });

  it('cae a plain_text un formato desconocido en vez de descartarlo', () => {
    const text = '42 :: 7.5 :: ###';

    const blocks = parseContentBlocks(text);

    expect(blocks).toEqual([{ type: 'plain_text', text: '42 :: 7.5 :: ###' }]);
  });

  it('no produce bloques para un fragmento vacio o compuesto solo de espacios', () => {
    expect(parseContentBlocks('')).toEqual([]);
    expect(parseContentBlocks('   \n  \n ')).toEqual([]);
  });

  it('no duplica mas alla de lo que justifica el mismo fragmento reenviado dos veces', () => {
    const state = createStreamBuffer();
    const chunk = 'hola\n\n';

    const first = pushStreamChunk(state, chunk);
    const second = pushStreamChunk(first.state, chunk);

    expect(first.completedBlocks).toEqual([
      { type: 'paragraph', text: 'hola' },
    ]);
    expect(second.completedBlocks).toEqual([
      { type: 'paragraph', text: 'hola' },
    ]);
  });

  it('degrada solo el fragmento central con fallo inyectado y parsea con normalidad los otros dos (TC-027, decision D6)', () => {
    const middleText = 'Segundo parrafo.';
    const text = makeThreeParagraphMessage(middleText);
    armParseFault(1);

    const blocks = parseContentBlocks(text);

    expect(blocks).toEqual([
      { type: 'paragraph', text: 'Primer parrafo.' },
      { type: 'plain_text', text: middleText },
      { type: 'paragraph', text: 'Tercer parrafo.' },
    ]);
  });
});

describe('parseContentBlocks — comando de terminal crudo (H3/D4)', () => {
  it('no confunde prosa real que por casualidad contiene "<" literal con una invocacion de comando', () => {
    const text =
      'El valor de x es menor <command-name> que 10, no un XML real.';

    const [block] = parseContentBlocks(text);

    expect(block.type).not.toBe('command_invocation');
  });

  it('reconoce las 3 etiquetas en el orden real name/message/args', () => {
    const text =
      '<command-name>/clear</command-name>\n<command-message>clear</command-message>\n<command-args></command-args>';

    const [block] = parseContentBlocks(text);

    expect(block).toEqual({
      type: 'command_invocation',
      name: '/clear',
      message: 'clear',
      args: '',
    });
  });

  it('reconoce las 3 etiquetas cuando el orden real es message/name/args (variacion observada)', () => {
    const text =
      '<command-message>flujo-core:flujo-implement</command-message>\n<command-name>/flujo-core:flujo-implement</command-name>\n<command-args></command-args>';

    const [block] = parseContentBlocks(text);

    expect(block).toEqual({
      type: 'command_invocation',
      name: '/flujo-core:flujo-implement',
      message: 'flujo-core:flujo-implement',
      args: '',
    });
  });
});

describe('parseContentBlocks — happy path', () => {
  it('reconoce parrafo, bloque de codigo y tabla en un mismo mensaje completo (fixture real de investigacion)', () => {
    const text = readFixtureText();

    const blocks = parseContentBlocks(text);

    expect(blocks).toContainEqual({
      type: 'paragraph',
      text: expect.stringContaining('texto en negrita'),
    });
    expect(blocks).toContainEqual({
      type: 'code',
      language: 'typescript',
      code: expect.stringContaining('const saludar'),
    });
    expect(blocks).toContainEqual({
      type: 'table',
      headers: ['Característica', 'Descripción'],
      rows: [
        ['**Velocidad**', 'Procesamiento rápido de consultas'],
        ['**Precisión**', 'Respuestas contextuales y exactas'],
      ],
    });
  });
});

describe('isMarkdownTextBlock — solo parrafo pasa por markdown-it (H6/D5)', () => {
  it('un bloque de codigo y uno de tabla del mismo mensaje quedan fuera del camino de markdown-it', () => {
    const text = readFixtureText();

    const blocks = parseContentBlocks(text);
    const codeBlock = blocks.find((block) => block.type === 'code')!;
    const tableBlock = blocks.find((block) => block.type === 'table')!;
    const paragraphBlock = blocks.find((block) => block.type === 'paragraph')!;

    expect(isMarkdownTextBlock(codeBlock)).toBe(false);
    expect(isMarkdownTextBlock(tableBlock)).toBe(false);
    expect(isMarkdownTextBlock(paragraphBlock)).toBe(true);
  });

  it('un texto de un solo comando o referencia de archivo no se clasifica como parrafo', () => {
    const blocks = parseContentBlocks('$ npm run build\n\n`src/App.vue`');

    expect(blocks.every((block) => !isMarkdownTextBlock(block))).toBe(true);
  });

  it('el parrafo de un mensaje de Claude con negrita, lista y enlace renderiza HTML real, no marcado crudo', () => {
    const blocks = parseContentBlocks(
      'El **Plan mode** permite:\n- revisar\n- confirmar en https://example.com',
    );
    const paragraphBlock = blocks.find((block) => isMarkdownTextBlock(block))!;

    const html = renderChatDraftMarkdown(paragraphBlock.text);

    expect(html).toContain('<strong>Plan mode</strong>');
    expect(html).toContain('<li>revisar</li>');
    expect(html).toContain('<a href="https://example.com"');
    expect(html).not.toContain('**Plan mode**');
  });
});
