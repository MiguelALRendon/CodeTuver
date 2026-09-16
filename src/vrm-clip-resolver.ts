import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  createVRMAnimationClip,
  VRMAnimationLoaderPlugin,
  type VRMAnimation,
} from '@pixiv/three-vrm-animation';
import type { VRM } from '@pixiv/three-vrm';
import { PROCEDURAL_CLIPS_BY_ID } from './procedural-animations';
import {
  resolveBoneNodeFromVrm,
  resolveRawBoneNodeFromNormalizedNodeName,
  retargetProceduralClip,
} from './vrm-clip-retarget';

export type ClipCache = Map<string, THREE.AnimationClip>;

// Extraido de VrmAvatar.vue (H7, revision-ux-sesion-real-3): AnimationTimelineEditor.vue lo reusa para precargar keyframes reales al editar.
export async function loadVrmaClip(
  vrm: VRM,
  url: string,
  cache: ClipCache,
): Promise<THREE.AnimationClip | null> {
  const cached = cache.get(url);
  if (cached) return cached;
  try {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    const vrmAnimations = gltf.userData.vrmAnimations as
      VRMAnimation[] | undefined;
    const vrmAnimation = vrmAnimations?.[0];
    if (!vrmAnimation) return null;
    const normalizedClip = createVRMAnimationClip(vrmAnimation, vrm);
    const clip = retargetProceduralClip(
      normalizedClip,
      resolveRawBoneNodeFromNormalizedNodeName(vrm),
    );
    if (!clip) return null;
    cache.set(url, clip);
    return clip;
  } catch (error) {
    console.error(
      '[vrm-clip-resolver] fallo aislado al cargar animacion/pose:',
      url,
      error,
    );
    return null;
  }
}

export function retargetedProceduralClip(
  vrm: VRM,
  id: string,
  cache: ClipCache,
): THREE.AnimationClip | null {
  const entry = PROCEDURAL_CLIPS_BY_ID.get(id);
  if (!entry) return null;
  const cacheKey = `procedural:${id}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const retargeted = retargetProceduralClip(
    entry.clip,
    resolveBoneNodeFromVrm(vrm),
  );
  if (!retargeted) return null;
  cache.set(cacheKey, retargeted);
  return retargeted;
}

// Un id de catalogo procedural se retargetea contra el VRM cargado; cualquier otro string sigue el camino de URL de .vrma.
export async function resolveClip(
  vrm: VRM,
  idOrUrl: string,
  cache: ClipCache,
): Promise<THREE.AnimationClip | null> {
  if (PROCEDURAL_CLIPS_BY_ID.has(idOrUrl))
    return retargetedProceduralClip(vrm, idOrUrl, cache);
  return loadVrmaClip(vrm, idOrUrl, cache);
}
