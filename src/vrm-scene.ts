import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';

export const CAMERA_FOV_DEG = 28;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 20;

export interface VrmSceneSetup {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  clock: THREE.Clock;
}

// 5.2: extraido de VrmAvatar.vue sin cambiar comportamiento, para que PoseEditor.vue (Hito 5) reuse la misma escena.
export function setupVrmScene(canvas: HTMLCanvasElement): VrmSceneSetup {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  const scene = new THREE.Scene();
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV_DEG,
    aspect,
    CAMERA_NEAR,
    CAMERA_FAR,
  );
  camera.position.set(0, 1.35, 1.6);
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const directional = new THREE.DirectionalLight(0xffffff, 0.6);
  directional.position.set(1, 1, 1);
  scene.add(directional);
  const clock = new THREE.Clock();
  return { renderer, scene, camera, clock };
}

function resizeVrmScene(setup: VrmSceneSetup, canvas: HTMLCanvasElement): void {
  const { clientWidth, clientHeight } = canvas;
  if (clientWidth === 0 || clientHeight === 0) return;
  setup.renderer.setSize(clientWidth, clientHeight, false);
  setup.camera.aspect = clientWidth / clientHeight;
  setup.camera.updateProjectionMatrix();
}

// Los editores 3D (posado/timeline) viven ahora en un overlay dimensionado por CSS (~92vw/88vh, animaciones-editables-correcciones), no en un panel de tamano fijo: sin esto, redimensionar la ventana o el propio modal deja la resolucion interna del renderer y el aspecto de camara desincronizados del tamano real del canvas.
export function observeVrmSceneResize(
  setup: VrmSceneSetup,
  canvas: HTMLCanvasElement,
): () => void {
  const observer = new ResizeObserver(() => resizeVrmScene(setup, canvas));
  observer.observe(canvas);
  return () => observer.disconnect();
}

export async function loadVrmModel(
  scene: THREE.Scene,
  url: string,
): Promise<VRM> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);
  const loadedVrm = gltf.userData.vrm as VRM;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.rotateVRM0(loadedVrm);
  scene.add(loadedVrm.scene);
  return loadedVrm;
}
