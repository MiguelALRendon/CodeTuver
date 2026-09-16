export type CharacterKind = 'vrm';

export interface CharacterCatalogEntry {
  id: string;
  name: string;
  kind: CharacterKind;
  author: string;
  license: string;
  attribution: string;
  modelUrl: string;
  requiresLicenseAcceptance?: boolean;
}

const RABBIT_MODEL_URL = new URL(
  './assets/characters/rabbit.vrm',
  import.meta.url,
).href;
const POLYDANCER_MODEL_URL = new URL(
  './assets/characters/polydancer.vrm',
  import.meta.url,
).href;
const ALICIA_MODEL_URL = new URL(
  './assets/characters/alicia-solid.vrm',
  import.meta.url,
).href;

// Excepcion consciente a R9, riesgo aceptado por el usuario 2026-08-29 (ver plan.md, paso 8.1, hallazgo completo).
const LICENSE_DISCLAIMER =
  'CC0 declarado por el agregador ToxSam/open-source-avatars; el repo original PolygonalMind/100Avatars no tiene archivo LICENSE propio (404 en la API de GitHub, issue #2 "Missing license" sin resolver desde 2021). El README original solo pide no revender sin modificacion mayor, no es CC0 puro. Riesgo de licencia aceptado explicitamente por el usuario.';

export const CHARACTER_CATALOG: CharacterCatalogEntry[] = [
  {
    id: 'rabbit',
    name: 'Rabbit',
    kind: 'vrm',
    author: 'Polygonal Mind / coleccion 100Avatars',
    license: LICENSE_DISCLAIMER,
    attribution:
      'Modelo #059 de la coleccion 100Avatars (PolygonalMind/100Avatars), redistribuido via ToxSam/open-source-avatars.',
    modelUrl: RABBIT_MODEL_URL,
    requiresLicenseAcceptance: true,
  },
  {
    id: 'polydancer',
    name: 'Polydancer',
    kind: 'vrm',
    author: 'Polygonal Mind / coleccion 100Avatars',
    license: LICENSE_DISCLAIMER,
    attribution:
      'Modelo #021 de la coleccion 100Avatars (PolygonalMind/100Avatars), redistribuido via ToxSam/open-source-avatars.',
    modelUrl: POLYDANCER_MODEL_URL,
    requiresLicenseAcceptance: true,
  },
  {
    id: 'alicia-solid',
    name: 'Alicia Solid',
    kind: 'vrm',
    author: 'Dwango Co., Ltd. (diseno: Kouhaku Kuroboshi, modelado: Kei Ukoku)',
    license:
      'Terminos VRoid Hub para Alicia Solid: permite uso como avatar, uso comercial no lucrativo individual y corporativo, redistribucion y alteracion del modelo.',
    attribution:
      'Modelo de muestra oficial del formato VRM (VRM Consortium / Dwango), incluido como fixture de pruebas en vrm-c/UniVRM.',
    modelUrl: ALICIA_MODEL_URL,
  },
];
