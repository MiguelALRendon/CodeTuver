import { describe, expect, it } from 'vitest';
import {
  applyAnchorChange,
  applyAssignmentChange,
  applySizeChange,
  assignmentForState,
  capabilitiesForImportedCharacter,
  capabilitiesForTestAvatar,
  clampAnchorToArea,
  clampRotationDegrees,
  clampTransitionDuration,
  createCharacterEditorState,
  DEFAULT_ANCHOR,
  DEFAULT_CHARACTER_SIZE,
  defaultAssignmentsFor,
  defaultCharacterEditorSettings,
  discardEditorChanges,
  importedAnimationCatalog,
  isAnchorWithinArea,
  markEditorSaved,
  MAX_ROTATION_DEGREES,
  MAX_TRANSITION_DURATION_MS,
  MIN_ROTATION_DEGREES,
  registerImportedAnimation,
  resolveActiveStateAssignment,
} from './character-editor';
import type {
  CharacterEditorSettings,
  StateAssignment,
} from './character-editor';
import type { WindowDimensions } from './monitor-position';

const CAPABILITIES = capabilitiesForTestAvatar();

describe('capabilitiesForImportedCharacter', () => {
  it('un VRM importado tiene animacion/pose habilitadas, con el mismo motor generico que uno de fabrica', () => {
    const vrmCapabilities = capabilitiesForImportedCharacter(
      { expression: false, mouth: false, eyebrows: false },
      'vrm',
    );

    expect(vrmCapabilities.animation).toEqual({
      supported: true,
      reason: null,
    });
    expect(vrmCapabilities.pose).toEqual({ supported: true, reason: null });
  });

  it('un Live2D importado mantiene animacion/pose deshabilitadas con su razon real (no regresiona)', () => {
    const live2dCapabilities = capabilitiesForImportedCharacter(
      { expression: false, mouth: false, eyebrows: false },
      'live2d',
    );

    expect(live2dCapabilities.animation.supported).toBe(false);
    expect(live2dCapabilities.animation.reason).toBeTruthy();
    expect(live2dCapabilities.pose.supported).toBe(false);
    expect(live2dCapabilities.pose.reason).toBeTruthy();
  });

  it('un VRM importado hereda los mismos defaults de fabrica por estado que un personaje de prueba', () => {
    const vrmCapabilities = capabilitiesForImportedCharacter(
      { expression: false, mouth: false, eyebrows: false },
      'vrm',
    );

    const importedDefaults = defaultAssignmentsFor(vrmCapabilities);
    const factoryDefaults = defaultAssignmentsFor(CAPABILITIES);

    const importedIdle = assignmentForState(importedDefaults, 'idle');
    const factoryIdle = assignmentForState(factoryDefaults, 'idle');

    expect(importedIdle.animations).toEqual(factoryIdle.animations);
    expect(importedIdle.pose).toEqual(factoryIdle.pose);
  });
});

describe('character-editor — casos adversos', () => {
  it('descartar sin haber cambiado nada deja editing equivalente al original', () => {
    const state = createCharacterEditorState('personaje-1', CAPABILITIES, null);

    const discarded = discardEditorChanges(state);

    expect(discarded.editing).toEqual(state.original);
  });

  it('descartar despues de cambiar y guardar vuelve al original, no al ultimo guardado', () => {
    const state = createCharacterEditorState('personaje-2', CAPABILITIES, null);
    const firstChange = applyAssignmentChange(state, CAPABILITIES, {
      state: 'idle',
      expression: 'happy',
    });
    const saved = markEditorSaved(firstChange);
    const secondChange = applyAssignmentChange(saved, CAPABILITIES, {
      state: 'idle',
      expression: 'sad',
    });

    const discarded = discardEditorChanges(secondChange);

    expect(discarded.editing).toEqual(state.original);
  });

  it('los ajustes de un personaje no contaminan a otro con las mismas capabilities', () => {
    const stateA = createCharacterEditorState(
      'personaje-a',
      CAPABILITIES,
      null,
    );
    const stateB = createCharacterEditorState(
      'personaje-b',
      CAPABILITIES,
      null,
    );

    applyAssignmentChange(stateA, CAPABILITIES, {
      state: 'idle',
      expression: 'excited',
    });

    expect(stateB.editing).toEqual(
      defaultCharacterEditorSettings(CAPABILITIES),
    );
  });

  it('devuelve el estado sin expresion asignada en vez de lanzar excepcion', () => {
    const assignments: StateAssignment[] = [
      { state: 'idle', expression: 'happy' },
    ];

    const result = assignmentForState(assignments, 'error');

    expect(result).toEqual({ state: 'error' });
  });

  it('un anclaje que dejaria al personaje fuera del area visible se acota dentro del area', () => {
    const state = createCharacterEditorState('personaje-3', CAPABILITIES, null);
    const smallArea: WindowDimensions = { width: 200, height: 200 };

    const result = applyAnchorChange(
      state,
      { corner: 'bottom-right', marginX: 500, marginY: 500 },
      smallArea,
    );

    expect(
      isAnchorWithinArea(
        result.editing.anchor,
        result.editing.size,
        { baseWidth: 128, baseHeight: 128 },
        smallArea,
      ),
    ).toBe(true);
  });

  it('un margen negativo se rechaza en la validacion y se acota a 0, nunca queda negativo', () => {
    const area: WindowDimensions = { width: 800, height: 600 };
    const negativeAnchor = {
      corner: 'bottom-right' as const,
      marginX: -10,
      marginY: -10,
    };

    const isValid = isAnchorWithinArea(
      negativeAnchor,
      1,
      { baseWidth: 128, baseHeight: 128 },
      area,
    );
    const clamped = clampAnchorToArea(
      negativeAnchor,
      1,
      { baseWidth: 128, baseHeight: 128 },
      area,
    );

    expect({
      isValid,
      clampedMarginX: clamped.marginX,
      clampedMarginY: clamped.marginY,
    }).toEqual({
      isValid: false,
      clampedMarginX: 0,
      clampedMarginY: 0,
    });
  });

  it('asignar una animacion en un personaje Live2D (sin renderizador) la descarta, nunca se cuela', () => {
    const importedCapabilities = capabilitiesForImportedCharacter(
      {
        expression: false,
        mouth: false,
        eyebrows: false,
      },
      'live2d',
    );
    const state = createCharacterEditorState(
      'personaje-4',
      importedCapabilities,
      null,
    );

    const result = applyAssignmentChange(state, importedCapabilities, {
      state: 'idle',
      animations: ['salto-especial'],
    });

    expect(
      assignmentForState(result.editing.assignments, 'idle').animations,
    ).toBeUndefined();
  });

  it('un id de animacion inexistente en el catalogo se filtra aunque el personaje si soporte animacion', () => {
    const state = createCharacterEditorState('personaje-7', CAPABILITIES, null);

    const result = applyAssignmentChange(state, CAPABILITIES, {
      state: 'idle',
      animations: ['neutral-animation-1', 'id-que-no-existe'],
    });

    expect(
      assignmentForState(result.editing.assignments, 'idle').animations,
    ).toEqual(['neutral-animation-1']);
  });

  it('un id de pose inexistente en el catalogo se descarta a undefined, no se cuela texto libre', () => {
    const state = createCharacterEditorState('personaje-8', CAPABILITIES, null);

    const result = applyAssignmentChange(state, CAPABILITIES, {
      state: 'idle',
      pose: 'pose-inventada-a-mano',
    });

    expect(
      assignmentForState(result.editing.assignments, 'idle').pose,
    ).toBeUndefined();
  });

  it('un id importado que no fue registrado se filtra igual que uno inventado a mano', () => {
    const state = createCharacterEditorState(
      'personaje-importado-1',
      CAPABILITIES,
      null,
    );

    const result = applyAssignmentChange(state, CAPABILITIES, {
      state: 'idle',
      animations: ['C:/datos/imported-animations/sin-registrar.vrma'],
    });

    expect(
      assignmentForState(result.editing.assignments, 'idle').animations,
    ).toEqual([]);
  });

  it('cambiar el tamaño tambien re-acota el anclaje existente, no solo el tamaño', () => {
    const state = createCharacterEditorState('personaje-5', CAPABILITIES, null);
    const area: WindowDimensions = { width: 1024, height: 768 };
    const withAnchor = applyAnchorChange(
      state,
      { corner: 'bottom-right', marginX: 800, marginY: 600 },
      area,
    );

    const resized = applySizeChange(withAnchor, 2, area);

    expect(
      isAnchorWithinArea(
        resized.editing.anchor,
        resized.editing.size,
        { baseWidth: 128, baseHeight: 128 },
        area,
      ),
    ).toBe(true);
  });
});

describe('character-editor — happy path', () => {
  it('un id de animacion y de pose que si existen en el catalogo se conservan tal cual', () => {
    const state = createCharacterEditorState('personaje-9', CAPABILITIES, null);

    const result = applyAssignmentChange(state, CAPABILITIES, {
      state: 'idle',
      animations: ['neutral-animation-1', 'neutral-animation-2'],
      pose: 'neutral-pose-1',
    });

    expect(assignmentForState(result.editing.assignments, 'idle')).toEqual({
      state: 'idle',
      expression: undefined,
      animations: ['neutral-animation-1', 'neutral-animation-2'],
      pose: 'neutral-pose-1',
    });
  });

  it('aplica una asignacion, cambia tamaño y anclaje dentro de rango, y guarda reflejando los tres cambios', () => {
    const state = createCharacterEditorState('personaje-6', CAPABILITIES, null);
    const area: WindowDimensions = { width: 1920, height: 1080 };

    const withAssignment = applyAssignmentChange(state, CAPABILITIES, {
      state: 'success',
      expression: 'happy',
    });
    const withSize = applySizeChange(withAssignment, 1.5, area);
    const withAnchor = applyAnchorChange(
      withSize,
      { corner: 'top-left', marginX: 40, marginY: 40 },
      area,
    );
    const saved = markEditorSaved(withAnchor);

    expect({
      saved: saved.saved,
      original: saved.original,
    }).toEqual({
      saved: {
        assignments: withAnchor.editing.assignments,
        anchor: { corner: 'top-left', marginX: 40, marginY: 40 },
        size: 1.5,
      },
      original: defaultCharacterEditorSettings(CAPABILITIES),
    });
  });

  it('un clip importado y registrado se conserva en la asignacion y aparece en el catalogo', () => {
    const summary = {
      id: 'gesto.vrma',
      name: 'gesto',
      savedPath: 'C:/datos/imported-animations/gesto.vrma',
      kind: 'pose' as const,
    };
    registerImportedAnimation(summary);
    const state = createCharacterEditorState(
      'personaje-importado-2',
      CAPABILITIES,
      null,
    );

    const result = applyAssignmentChange(state, CAPABILITIES, {
      state: 'idle',
      pose: summary.savedPath,
    });

    expect(assignmentForState(result.editing.assignments, 'idle').pose).toBe(
      summary.savedPath,
    );
    expect(importedAnimationCatalog()).toContainEqual(summary);
  });
});

describe('resolveActiveStateAssignment', () => {
  it('sin config persistida y sin soporte de animacion/pose (Live2D), no resuelve ninguna de las dos', () => {
    const importedCapabilities = capabilitiesForImportedCharacter(
      {
        expression: true,
        mouth: true,
        eyebrows: true,
      },
      'live2d',
    );

    const result = resolveActiveStateAssignment(
      null,
      importedCapabilities,
      'idle',
    );

    expect(result.animations).toBeUndefined();
    expect(result.pose).toBeUndefined();
  });

  it('sin config persistida pero con soporte, cae en el pool de fabrica del estado en vez de quedarse en silencio', () => {
    const result = resolveActiveStateAssignment(null, CAPABILITIES, 'idle');

    expect(result.animations?.length).toBeGreaterThanOrEqual(3);
    expect(result.pose).toBeTypeOf('string');
  });

  it('con config persistida que no trae el estado pedido, cae en el fallback vacio, no en los defaults de fabrica', () => {
    const persisted = defaultCharacterEditorSettings(CAPABILITIES);
    const withoutIdle: CharacterEditorSettings = {
      ...persisted,
      assignments: persisted.assignments.filter(
        (entry) => entry.state !== 'idle',
      ),
    };

    const result = resolveActiveStateAssignment(
      withoutIdle,
      CAPABILITIES,
      'idle',
    );

    expect(result).toEqual({ state: 'idle' });
  });

  it('con config persistida y el estado presente, devuelve exactamente lo asignado', () => {
    const summary = {
      id: 'saludo.vrma',
      name: 'saludo',
      savedPath: 'C:/datos/imported-animations/saludo.vrma',
      kind: 'animation' as const,
    };
    registerImportedAnimation(summary);
    const state = createCharacterEditorState(
      'personaje-en-vivo',
      CAPABILITIES,
      null,
    );
    const withAssignment = applyAssignmentChange(state, CAPABILITIES, {
      state: 'success',
      animations: [summary.savedPath],
    });
    const saved = markEditorSaved(withAssignment);

    const result = resolveActiveStateAssignment(
      saved.saved,
      CAPABILITIES,
      'success',
    );

    expect(result.animations).toEqual([summary.savedPath]);
  });
});

describe('vocabulario real vs. curado (Hallazgo 6)', () => {
  it('un estado real no curado sin alias definido cae en el fallback generico por mood, nunca en silencio', () => {
    const result = resolveActiveStateAssignment(
      null,
      CAPABILITIES,
      'celebrando',
    );

    expect(result.animations?.length).toBeGreaterThan(0);
  });

  it('un estado real con alias respeta la personalizacion del usuario en el estado curado destino', () => {
    const state = createCharacterEditorState(
      'personaje-alias',
      CAPABILITIES,
      null,
    );
    const withCustomThinking = applyAssignmentChange(state, CAPABILITIES, {
      state: 'thinking',
      animations: ['active-animation-4'],
    });
    const saved = markEditorSaved(withCustomThinking);

    const result = resolveActiveStateAssignment(
      saved.saved,
      CAPABILITIES,
      'pensativa',
    );

    expect(result.animations).toEqual(['active-animation-4']);
  });

  it('pensativa, confundida y no-entendio resuelven a los defaults de fabrica de su estado curado', () => {
    const pensativa = resolveActiveStateAssignment(
      null,
      CAPABILITIES,
      'pensativa',
    );
    const confundida = resolveActiveStateAssignment(
      null,
      CAPABILITIES,
      'confundida',
    );

    expect(pensativa.animations).toEqual(
      resolveActiveStateAssignment(null, CAPABILITIES, 'thinking').animations,
    );
    expect(confundida.animations).toEqual(
      resolveActiveStateAssignment(null, CAPABILITIES, 'confused').animations,
    );
  });
});

describe('migracion de shape antiguo, campo a campo (Hallazgo 5)', () => {
  it('una entrada persistida sin animations ni pose completa ambos desde fabrica, preservando la expresion personalizada', () => {
    const persisted: CharacterEditorSettings = {
      assignments: [{ state: 'idle', expression: 'excited' }],
      anchor: DEFAULT_ANCHOR,
      size: DEFAULT_CHARACTER_SIZE,
    };

    const editorState = createCharacterEditorState(
      'personaje-shape-viejo',
      CAPABILITIES,
      persisted,
    );
    const liveAssignment = resolveActiveStateAssignment(
      persisted,
      CAPABILITIES,
      'idle',
    );

    for (const result of [
      assignmentForState(editorState.saved.assignments, 'idle'),
      liveAssignment,
    ]) {
      expect(result.expression).toBe('excited');
      expect(result.animations?.length).toBeGreaterThan(0);
      expect(result.pose).toBeTypeOf('string');
    }
  });

  it('una entrada persistida ya completa no se sobreescribe con los defaults de fabrica', () => {
    const persisted: CharacterEditorSettings = {
      assignments: [
        {
          state: 'idle',
          expression: 'excited',
          animations: ['active-animation-4'],
          pose: 'active-pose-2',
        },
      ],
      anchor: DEFAULT_ANCHOR,
      size: DEFAULT_CHARACTER_SIZE,
    };

    const result = resolveActiveStateAssignment(
      persisted,
      CAPABILITIES,
      'idle',
    );

    expect(result.animations).toEqual(['active-animation-4']);
    expect(result.pose).toBe('active-pose-2');
  });

  it('un estado sin ninguna entrada persistida (no solo con campos faltantes) sigue devolviendo vacio, no defaults', () => {
    const persisted: CharacterEditorSettings = {
      assignments: [],
      anchor: DEFAULT_ANCHOR,
      size: DEFAULT_CHARACTER_SIZE,
    };

    const result = resolveActiveStateAssignment(
      persisted,
      CAPABILITIES,
      'idle',
    );

    expect(result).toEqual({ state: 'idle' });
  });
});

describe('poseCleared — "(sin asignar)" deliberado vs. campo nunca personalizado (Hito 19, hallazgo del Hito 1)', () => {
  it('una entrada persistida sin pose y SIN poseCleared sigue cayendo al default de fabrica (no rompe la migracion del Hallazgo 5)', () => {
    const persisted: CharacterEditorSettings = {
      assignments: [{ state: 'idle', animations: ['neutral-animation-1'] }],
      anchor: DEFAULT_ANCHOR,
      size: DEFAULT_CHARACTER_SIZE,
    };

    const result = resolveActiveStateAssignment(
      persisted,
      CAPABILITIES,
      'idle',
    );

    expect(result.pose).toBeTypeOf('string');
  });

  it('una entrada persistida sin pose y CON poseCleared:true se queda genuinamente sin pose', () => {
    const persisted: CharacterEditorSettings = {
      assignments: [
        {
          state: 'idle',
          animations: ['neutral-animation-1'],
          poseCleared: true,
        },
      ],
      anchor: DEFAULT_ANCHOR,
      size: DEFAULT_CHARACTER_SIZE,
    };

    const result = resolveActiveStateAssignment(
      persisted,
      CAPABILITIES,
      'idle',
    );

    expect(result.pose).toBeUndefined();
  });

  it('poseCleared no afecta animaciones: un pool vacio con poseCleared:true igual cae al pool de fabrica (decision de diseño intencional, no tocada)', () => {
    const persisted: CharacterEditorSettings = {
      assignments: [{ state: 'idle', animations: [], poseCleared: true }],
      anchor: DEFAULT_ANCHOR,
      size: DEFAULT_CHARACTER_SIZE,
    };

    const result = resolveActiveStateAssignment(
      persisted,
      CAPABILITIES,
      'idle',
    );

    expect(result.animations?.length).toBeGreaterThan(0);
    expect(result.pose).toBeUndefined();
  });

  it('applyAssignmentChange (via sanitizeAssignment) preserva poseCleared en vez de descartarlo', () => {
    const editorState = createCharacterEditorState(
      'personaje-pose-cleared',
      CAPABILITIES,
      null,
    );

    const next: StateAssignment = {
      ...assignmentForState(editorState.editing.assignments, 'idle'),
      pose: undefined,
      poseCleared: true,
    };
    const updated = applyAssignmentChange(editorState, CAPABILITIES, next);

    expect(
      assignmentForState(updated.editing.assignments, 'idle').poseCleared,
    ).toBe(true);
  });

  it('reasignar un pose real limpia poseCleared (applyAssignmentChange con poseCleared:undefined)', () => {
    const editorState = createCharacterEditorState(
      'personaje-pose-reasignada',
      CAPABILITIES,
      {
        assignments: [{ state: 'idle', poseCleared: true }],
        anchor: DEFAULT_ANCHOR,
        size: DEFAULT_CHARACTER_SIZE,
      },
    );

    const next: StateAssignment = {
      ...assignmentForState(editorState.editing.assignments, 'idle'),
      pose: 'active-pose-1',
      poseCleared: undefined,
    };
    const updated = applyAssignmentChange(editorState, CAPABILITIES, next);
    const result = assignmentForState(updated.editing.assignments, 'idle');

    expect(result.pose).toBe('active-pose-1');
    expect(result.poseCleared).toBeUndefined();
  });
});

describe('transitionDurationMs — pasa a traves de sanitizeAssignment (Hito 3)', () => {
  it('applyAssignmentChange preserva transitionDurationMs en vez de descartarlo', () => {
    const editorState = createCharacterEditorState(
      'personaje-transicion',
      CAPABILITIES,
      null,
    );

    const next: StateAssignment = {
      ...assignmentForState(editorState.editing.assignments, 'idle'),
      transitionDurationMs: 800,
    };
    const updated = applyAssignmentChange(editorState, CAPABILITIES, next);

    expect(
      assignmentForState(updated.editing.assignments, 'idle')
        .transitionDurationMs,
    ).toBe(800);
  });

  it('sin transitionDurationMs asignado, el campo queda undefined (VrmAvatar aplica su propio default)', () => {
    const editorState = createCharacterEditorState(
      'personaje-sin-transicion',
      CAPABILITIES,
      null,
    );

    expect(
      assignmentForState(editorState.editing.assignments, 'idle')
        .transitionDurationMs,
    ).toBeUndefined();
  });
});

describe('clampTransitionDuration (correcciones-qa-gauntlet Hito 5)', () => {
  it('un valor extremo real (999999999, el caso que encontro el bug) se clampa al tope', () => {
    expect(clampTransitionDuration(999999999)).toBe(MAX_TRANSITION_DURATION_MS);
  });

  it('un valor negativo se clampa a 0', () => {
    expect(clampTransitionDuration(-500)).toBe(0);
  });

  it('un valor dentro de rango no se altera', () => {
    expect(clampTransitionDuration(2500)).toBe(2500);
  });
});

describe('clampRotationDegrees (correcciones-qa-gauntlet Hito 5)', () => {
  it('99999 grados se clampa al tope superior', () => {
    expect(clampRotationDegrees(99999)).toBe(MAX_ROTATION_DEGREES);
  });

  it('-99999 grados se clampa al tope inferior', () => {
    expect(clampRotationDegrees(-99999)).toBe(MIN_ROTATION_DEGREES);
  });

  it('un valor dentro de rango no se altera', () => {
    expect(clampRotationDegrees(45)).toBe(45);
  });
});
