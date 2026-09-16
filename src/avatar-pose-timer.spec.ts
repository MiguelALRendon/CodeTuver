import { describe, expect, it } from 'vitest';
import {
  advancePoseTimer,
  boneNameFromTrackName,
  createPoseTimerState,
  isPoseActive,
  needsAdditiveBlend,
  POSE_HOLD_MAX_MS,
  POSE_TRIGGER_MAX_MS,
  POSE_TRIGGER_MIN_MS,
} from './avatar-pose-timer';

describe('advancePoseTimer — casos adversos', () => {
  it('un estado sin pose asignada (hasPose=false) siempre vuelve a idle, nunca queda activo a medias', () => {
    const active = { phase: 'active' as const, elapsedMs: 100, targetMs: 3000 };
    const result = advancePoseTimer(active, 50, false, () => 0.5);
    expect(result.phase).toBe('idle');
    expect(isPoseActive(result)).toBe(false);
  });

  it('avanzar con deltaMs=0 no dispara la pose antes de tiempo', () => {
    const state = createPoseTimerState(() => 0);
    const result = advancePoseTimer(state, 0, true, () => 0);
    expect(result.phase).toBe('idle');
  });
});

describe('createPoseTimerState — happy path', () => {
  it('el intervalo de disparo respeta exactamente sus limites min/max declarados', () => {
    expect(createPoseTimerState(() => 0).targetMs).toBe(POSE_TRIGGER_MIN_MS);
    expect(createPoseTimerState(() => 1).targetMs).toBe(POSE_TRIGGER_MAX_MS);
  });
});

describe('advancePoseTimer / isPoseActive — happy path', () => {
  it('al cumplirse el intervalo de disparo, pasa de idle a active', () => {
    const state = createPoseTimerState(() => 0);
    const result = advancePoseTimer(state, state.targetMs, true, () => 0);
    expect(result.phase).toBe('active');
    expect(isPoseActive(result)).toBe(true);
  });

  it('al cumplirse el tiempo de sostenimiento, vuelve de active a idle', () => {
    const active = {
      phase: 'active' as const,
      elapsedMs: 0,
      targetMs: POSE_HOLD_MAX_MS,
    };
    const result = advancePoseTimer(active, POSE_HOLD_MAX_MS, true, () => 0);
    expect(result.phase).toBe('idle');
    expect(isPoseActive(result)).toBe(false);
  });
});

describe('boneNameFromTrackName — casos adversos', () => {
  it('un nombre de pista sin punto se devuelve entero (sin propiedad reconocible)', () => {
    expect(boneNameFromTrackName('head')).toBe('head');
  });
});

describe('boneNameFromTrackName — happy path', () => {
  it('separa el hueso de la propiedad de la pista three.js', () => {
    expect(boneNameFromTrackName('head.quaternion')).toBe('head');
    expect(boneNameFromTrackName('hips.position')).toBe('hips');
  });
});

describe('needsAdditiveBlend — casos adversos', () => {
  it('cero huesos en comun: no hace falta aditivo', () => {
    const background = ['head.quaternion', 'neck.quaternion'];
    const pose = ['leftUpperArm.quaternion', 'rightUpperArm.quaternion'];
    expect(needsAdditiveBlend(background, pose)).toBe(false);
  });

  it('sin ninguna pista en ninguno de los dos clips: no hace falta aditivo', () => {
    expect(needsAdditiveBlend([], [])).toBe(false);
  });
});

describe('needsAdditiveBlend — happy path', () => {
  it('solape total: hace falta aditivo', () => {
    const background = ['head.quaternion', 'neck.quaternion'];
    const pose = ['head.quaternion', 'neck.quaternion'];
    expect(needsAdditiveBlend(background, pose)).toBe(true);
  });

  it('solape parcial (un solo hueso compartido) ya alcanza para exigir aditivo', () => {
    const background = ['head.quaternion', 'neck.quaternion'];
    const pose = ['head.quaternion', 'leftUpperArm.quaternion'];
    expect(needsAdditiveBlend(background, pose)).toBe(true);
  });
});
