import { describe, expect, it } from 'vitest';
import { armAvatarDrawFault, TestAvatarController } from './avatar-controller';

const FAULT_MESSAGE = 'Fallo de dibujo del avatar (inyectado)';

describe('TestAvatarController — casos adversos', () => {
  it('acepta un estado no reconocido sin lanzar excepcion y sin marcarlo como fallo', () => {
    const avatar = new TestAvatarController();

    avatar.setState('un_estado_que_no_existe');

    expect({
      state: avatar.snapshot.state,
      lastError: avatar.snapshot.lastError,
    }).toEqual({ state: 'un_estado_que_no_existe', lastError: null });
  });

  it('acepta una expresion no soportada sin lanzar excepcion y sin marcarla como fallo', () => {
    const avatar = new TestAvatarController();

    avatar.setExpression('expresion_que_no_soporta');

    expect({
      expression: avatar.snapshot.expression,
      lastError: avatar.snapshot.lastError,
    }).toEqual({ expression: 'expresion_que_no_soporta', lastError: null });
  });

  it('conserva el estado anterior y registra el error cuando el renderizador falla a mitad de una transicion', () => {
    const avatar = new TestAvatarController();
    avatar.setState('idle_confirmado');
    armAvatarDrawFault();

    avatar.setState('estado_que_fallara');

    expect({
      state: avatar.snapshot.state,
      lastError: avatar.snapshot.lastError,
    }).toEqual({ state: 'idle_confirmado', lastError: FAULT_MESSAGE });
  });

  it('no inicia el ciclo de hablando ni deja error al hablar con texto vacio', async () => {
    const avatar = new TestAvatarController();

    await avatar.speak('');

    expect({
      isSpeaking: avatar.snapshot.isSpeaking,
      lastError: avatar.snapshot.lastError,
    }).toEqual({ isSpeaking: false, lastError: null });
  });

  it('no lanza excepcion ni deja error al detener el habla sin ninguna reproduccion en curso', () => {
    const avatar = new TestAvatarController();

    avatar.stopSpeaking();

    expect({
      isSpeaking: avatar.snapshot.isSpeaking,
      lastError: avatar.snapshot.lastError,
    }).toEqual({ isSpeaking: false, lastError: null });
  });

  it('deja de hablar y registra el error cuando el renderizador falla durante speak', async () => {
    const avatar = new TestAvatarController();
    armAvatarDrawFault();

    await avatar.speak('hola');

    expect({
      isSpeaking: avatar.snapshot.isSpeaking,
      lastError: avatar.snapshot.lastError,
    }).toEqual({ isSpeaking: false, lastError: FAULT_MESSAGE });
  });

  it('mantiene el snapshot de una instancia sin afectarse por operaciones sobre otra instancia distinta', () => {
    const first = new TestAvatarController();
    const second = new TestAvatarController();

    second.setState('estado_de_second');

    expect(first.snapshot.state).toBe('idle');
  });

  it('el fallo armado con armAvatarDrawFault es de modulo, no de instancia: lo consume la primera operacion que se ejecute en cualquier instancia', () => {
    const first = new TestAvatarController();
    const second = new TestAvatarController();
    armAvatarDrawFault();

    second.setState('estado_cualquiera');

    expect(second.snapshot.lastError).toBe(FAULT_MESSAGE);
    expect(first.snapshot.lastError).toBeNull();
  });
});

describe('TestAvatarController — happy path', () => {
  it('ejecuta setState, setExpression y speak en secuencia y termina con snapshot limpio', async () => {
    const avatar = new TestAvatarController();
    avatar.setState('thinking');
    avatar.setExpression('happy');

    await avatar.speak('hola');

    expect(avatar.snapshot).toEqual({
      state: 'thinking',
      expression: 'happy',
      isSpeaking: false,
      lastError: null,
    });
  });
});
