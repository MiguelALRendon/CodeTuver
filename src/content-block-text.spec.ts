import { describe, expect, it } from 'vitest';
import type { ContentBlock } from './content-interpreter';
import { blocksToMarkdownText, blocksToSpeechText } from './content-block-text';

describe('blocksToMarkdownText — casos adversos', () => {
  it('no imprime "undefined" en la valla de un bloque code sin language', () => {
    const blocks: ContentBlock[] = [{ type: 'code', code: 'const x = 1;' }];

    const text = blocksToMarkdownText(blocks);

    expect(text).toBe('```\nconst x = 1;\n```');
  });

  it('no rompe con un bloque diff que solo tiene additions y sin deletions', () => {
    const blocks: ContentBlock[] = [
      { type: 'diff', additions: [{ content: 'const x = 1;' }], deletions: [] },
    ];

    const text = blocksToMarkdownText(blocks);

    expect(text).toBe('+const x = 1;');
  });

  it('devuelve string vacio para un array vacio de bloques', () => {
    const text = blocksToMarkdownText([]);

    expect(text).toBe('');
  });

  it('serializa una mezcla de parrafo, heading, code y table en markdown bien formado', () => {
    const blocks: ContentBlock[] = [
      { type: 'paragraph', text: 'Resumen del cambio.' },
      { type: 'heading', level: 2, text: 'Detalles' },
      { type: 'code', language: 'ts', code: 'const x = 1;' },
      { type: 'table', headers: ['A', 'B'], rows: [['1', '2']] },
    ];

    const text = blocksToMarkdownText(blocks);

    expect(text).toBe(
      'Resumen del cambio.\n\n## Detalles\n\n```ts\nconst x = 1;\n```\n\nA | B\n1 | 2',
    );
  });
});

describe('blocksToSpeechText — AC-097 (la voz omite codigo y resume tablas)', () => {
  it('un bloque de codigo entre dos parrafos desaparece sin dejar hueco (los parrafos quedan continuos)', () => {
    const blocks: ContentBlock[] = [
      { type: 'paragraph', text: 'Antes.' },
      { type: 'code', language: 'ts', code: 'const x = 1;' },
      { type: 'paragraph', text: 'Despues.' },
    ];

    expect(blocksToSpeechText(blocks)).toBe('Antes.\n\nDespues.');
  });

  it('una tabla sola se menciona brevemente, sin leer celdas', () => {
    const blocks: ContentBlock[] = [
      { type: 'table', headers: ['Juego', 'Horas'], rows: [['Foo', '10']] },
    ];

    expect(blocksToSpeechText(blocks)).toBe('Hay una tabla.');
  });

  it('una tabla entre parrafos se menciona brevemente sin romper la continuidad', () => {
    const blocks: ContentBlock[] = [
      { type: 'paragraph', text: 'Aqui esta la lista.' },
      { type: 'table', headers: ['A'], rows: [['1']] },
      { type: 'paragraph', text: 'Eso es todo.' },
    ];

    expect(blocksToSpeechText(blocks)).toBe(
      'Aqui esta la lista.\n\nHay una tabla.\n\nEso es todo.',
    );
  });

  it('solo codigo produce un resultado vacio, no una cadena que solo tenga separadores', () => {
    const blocks: ContentBlock[] = [
      { type: 'code', language: 'ts', code: 'const x = 1;' },
    ];

    expect(blocksToSpeechText(blocks)).toBe('');
  });

  it('un comando se omite entero', () => {
    const blocks: ContentBlock[] = [{ type: 'command', command: 'ls -la' }];

    expect(blocksToSpeechText(blocks)).toBe('');
  });

  it('una invocacion de comando de terminal (H3) se omite entera, no se narra', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'command_invocation',
        name: '/clear',
        message: 'clear',
        args: '',
      },
    ];

    expect(blocksToSpeechText(blocks)).toBe('');
  });

  it('un diff se omite entero', () => {
    const blocks: ContentBlock[] = [
      { type: 'diff', additions: [{ content: 'x' }], deletions: [] },
    ];

    expect(blocksToSpeechText(blocks)).toBe('');
  });

  it('arte ASCII se omite entero', () => {
    const blocks: ContentBlock[] = [{ type: 'ascii_art', content: '(-_-)' }];

    expect(blocksToSpeechText(blocks)).toBe('');
  });

  it('un mensaje conversacional puro sale intacto', () => {
    const blocks: ContentBlock[] = [
      { type: 'paragraph', text: 'Hola, como estas?' },
    ];

    expect(blocksToSpeechText(blocks)).toBe('Hola, como estas?');
  });

  it('caso literal del reporte: ls -la y una tabla de juegos, solo se habla la prosa', () => {
    const blocks: ContentBlock[] = [
      { type: 'paragraph', text: 'Estos son tus juegos instalados:' },
      { type: 'command', command: 'ls -la' },
      {
        type: 'table',
        headers: ['Juego', 'Tamaño'],
        rows: [['Foo', '10GB']],
      },
      { type: 'paragraph', text: 'Avisame si quieres desinstalar alguno.' },
    ];

    expect(blocksToSpeechText(blocks)).toBe(
      'Estos son tus juegos instalados:\n\nHay una tabla.\n\nAvisame si quieres desinstalar alguno.',
    );
  });

  it('un parrafo con marcado real (negrita, encabezado, lista) se habla sin los caracteres de Markdown', () => {
    const blocks: ContentBlock[] = [
      { type: 'paragraph', text: 'El **Plan mode** esta activo.' },
      { type: 'paragraph', text: '# Resumen\n\n- uno\n- dos' },
    ];

    expect(blocksToSpeechText(blocks)).toBe(
      'El Plan mode esta activo.\n\nResumen\nuno\ndos',
    );
  });
});
