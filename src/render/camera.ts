// Angled RTS camera: looks at a ground target from a fixed pitch; pans, zooms, edge-scrolls, clamps to the map.
import * as THREE from 'three';

export class RtsCamera {
  readonly camera: THREE.PerspectiveCamera;
  targetX: number;
  targetZ: number;
  distance: number;
  readonly pitch = (55 * Math.PI) / 180;
  readonly minDist = 8;
  readonly maxDist: number;

  constructor(readonly mapW: number, readonly mapH: number, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 2000);
    this.targetX = mapW / 2; this.targetZ = mapH / 2;
    this.maxDist = Math.max(mapW, mapH) * 1.15;
    this.distance = Math.min(40, this.maxDist);
    this.apply();
  }

  setTarget(x: number, z: number): void { this.targetX = x; this.targetZ = z; this.apply(); }
  /** Pan by a screen-relative amount in "screens" (1 = roughly one view height). */
  pan(dxScreens: number, dzScreens: number): void {
    const k = this.distance * 0.75;
    this.targetX += dxScreens * k; this.targetZ += dzScreens * k; this.apply();
  }
  panWorld(dx: number, dz: number): void { this.targetX += dx; this.targetZ += dz; this.apply(); }
  zoom(steps: number): void {
    this.distance = Math.max(this.minDist, Math.min(this.maxDist, this.distance * Math.pow(1.12, steps)));
    this.apply();
  }
  resize(aspect: number): void { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }

  apply(): void {
    this.targetX = Math.max(0, Math.min(this.mapW, this.targetX));
    this.targetZ = Math.max(0, Math.min(this.mapH, this.targetZ));
    const y = Math.sin(this.pitch) * this.distance, back = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(this.targetX, y + 1, this.targetZ + back);
    this.camera.lookAt(this.targetX, 1, this.targetZ);
    this.camera.updateMatrixWorld();
  }

  /** World ray for a pointer at normalized device coords. */
  ray(ndcX: number, ndcY: number): THREE.Ray {
    const r = new THREE.Raycaster();
    r.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return r.ray;
  }

  /** Intersection of the view ray with the horizontal plane y = planeY (or null if parallel/behind). */
  groundAt(ndcX: number, ndcY: number, planeY = 1): THREE.Vector3 | null {
    const ray = this.ray(ndcX, ndcY);
    const p = new THREE.Vector3();
    return ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), p);
  }
}
