// ---------------------------------------------------------------------------
// Three.js renderer, camera, lights
// Bloom post-processing pipeline
// ------------------------------------------------------------

import * as THREE from 'three';
import { EffectComposer, RenderPass, BloomEffect, EffectPass } from 'postprocessing';

export interface SceneContext {
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    composer: EffectComposer;
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02030a);

    // Orthographic camera sized so that the total pendulum reach (~4.5 units)
    // fits comfortably. We'll use a view half-size of 6.
    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = 6;
    const camera = new THREE.OrthographicCamera(
        -viewSize * aspect,
        viewSize * aspect, 
        viewSize, 
        -viewSize,
        0.1,
        100
    );
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

    // Post Processing: Bloom
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloom = new BloomEffect({
        intensity: 1.5,
        luminanceThreshold: 0.1,
        luminanceSmoothing: 0.4,
        mipmapBlur: true,
    });
    composer.addPass(new EffectPass(camera, bloom));

    // Handle Resize
    window.addEventListener('resize', () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const a = w / h;

        camera.left = -viewSize * a;
        camera.right = viewSize * a;
        camera.top = viewSize;
        camera.bottom = -viewSize;
        camera.updateProjectionMatrix();

        renderer.setSize(w, h);
        composer.setSize(w, h);
    });

    return { scene, camera, composer };

}