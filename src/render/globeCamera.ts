// Camera for the 3D globe view (F-195). Same interface as RtsCamera (target, pan, zoom, ray,
// groundAt), but it orbits a planet: the target is a point on the surface, kept as an orientation
// (which way is "screen up" there), so you can pan straight over the poles and round in every
// direction. Close in it tilts like an RTS camera; far out it looks straight down at the whole planet.
import * as THREE from 'three';
import { GLOBE, fromGlobe, globeUp, northAt } from './globe';

export interface ViewCamera {
  readonly camera: THREE.PerspectiveCamera;
  targetX: number; targetZ: number; distance: number;
  readonly minDist: number; readonly maxDist: number;
  setTarget(x: number, z: number): void;
  pan(dxScreens: number, dzScreens: number): void;
  panWorld(dx: number, dz: number): void;
  zoom(steps: number): void;
  resize(aspect: number): void;
  apply(): void;
  ray(ndcX: number, ndcY: number): THREE.Ray;
  groundAt(ndcX: number, ndcY: number, planeY?: number): THREE.Vector3 | null;
}

export class GlobeCamera implements ViewCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Unit vector from the planet centre to the target, and the screen-up tangent there. */
  private dir = new THREE.Vector3(0, 0, 1);
  private up = new THREE.Vector3(0, 1, 0);
  distance: number;
  readonly minDist = 8;
  readonly maxDist: number;
  private readonly R: number;

  constructor(readonly mapW: number, readonly mapH: number, aspect: number) {
    this.R = GLOBE.size.value.z;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.5, this.R * 12);
    this.maxDist = this.R * 3.6;
    this.distance = Math.min(30, this.maxDist);
    this.setTarget(mapW / 2, mapH / 2);
  }

  get targetX(): number { return fromGlobe(this.dir.clone().multiplyScalar(this.R)).x; }
  set targetX(x: number) { this.setTarget(x, this.targetZ); }
  get targetZ(): number { return fromGlobe(this.dir.clone().multiplyScalar(this.R)).z; }
  set targetZ(z: number) { this.setTarget(this.targetX, z); }

  /** Look at a map point with north up. */
  setTarget(x: number, z: number): void {
    globeUp(x, z, this.dir);
    northAt(this.dir, this.up);
    if (!Number.isFinite(this.up.x) || this.up.lengthSq() < 0.5) this.up.set(0, 0, -1); // exactly at a pole
    this.apply();
  }

  /** Move the target by an angle: +right is screen-right, +down is screen-down. */
  private rotate(right: number, down: number): void {
    const east = new THREE.Vector3().crossVectors(this.up, this.dir).normalize();
    if (right) { this.dir.applyAxisAngle(this.up, right); }
    if (down) {
      const q = new THREE.Quaternion().setFromAxisAngle(east, down);
      this.dir.applyQuaternion(q); this.up.applyQuaternion(q);
    }
    // keep the frame orthonormal
    this.dir.normalize();
    this.up.sub(this.dir.clone().multiplyScalar(this.up.dot(this.dir))).normalize();
  }
  pan(dxScreens: number, dzScreens: number): void {
    const k = (this.distance * 0.75) / this.R;
    this.rotate(dxScreens * k, dzScreens * k);
    this.apply();
  }
  panWorld(dx: number, dz: number): void { this.rotate(dx / this.R, dz / this.R); this.apply(); }
  zoom(steps: number): void {
    this.distance = Math.max(this.minDist, Math.min(this.maxDist, this.distance * Math.pow(1.12, steps)));
    this.apply();
  }
  resize(aspect: number): void { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }

  apply(): void {
    const R = this.R, d = this.distance;
    // tilt: RTS angle (35° from straight down) when close, straight down over the whole planet when far
    const far = Math.min(1, Math.max(0, (d - R * 0.6) / (R * 1.6)));
    const tilt = (50 * Math.PI / 180) * (1 - far * far * (3 - 2 * far));
    const target = this.dir.clone().multiplyScalar(R + 0.8 * (1 - far));
    const back = this.dir.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(this.up, -Math.sin(tilt));
    this.camera.position.copy(target).addScaledVector(back, d);
    this.camera.up.copy(this.up).multiplyScalar(Math.cos(tilt)).addScaledVector(this.dir, Math.sin(tilt));
    this.camera.lookAt(target);
    this.camera.near = Math.max(0.3, d * 0.02);
    this.camera.far = d + R * 3;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  ray(ndcX: number, ndcY: number): THREE.Ray {
    const r = new THREE.Raycaster();
    r.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return r.ray;
  }

  /** Map point (x, 0, z) under a screen position, on the sea-level sphere; null off the planet. */
  groundAt(ndcX: number, ndcY: number): THREE.Vector3 | null {
    const hit = this.ray(ndcX, ndcY).intersectSphere(new THREE.Sphere(new THREE.Vector3(), this.R), new THREE.Vector3());
    if (!hit) return null;
    const m = fromGlobe(hit);
    return new THREE.Vector3(m.x, 0, m.z);
  }
}
