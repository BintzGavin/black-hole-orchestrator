import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);

export interface CameraBounds {
  minRadius: number;
  maxRadius: number;
  scenarioRadius: number;
  exclusionRadius: number;
}

/**
 * Mass-aware orbit/pan/dolly controller. Input is deliberately exposed as
 * methods so the app can decide whether a pointer gesture belongs to the
 * universe or to an overlaid HUD control.
 */
export class CameraController {
  readonly focus = new THREE.Vector3();
  readonly velocity = new THREE.Vector2();
  readonly panVelocity = new THREE.Vector2();

  reducedMotion = false;
  bounds: CameraBounds = {
    minRadius: 28,
    maxRadius: 1_400,
    scenarioRadius: 1_200,
    exclusionRadius: 24,
  };

  private readonly spherical = new THREE.Spherical(320, 1.18, 0.62);
  private readonly targetSpherical = this.spherical.clone();
  private readonly targetFocus = new THREE.Vector3();
  private pointerId: number | null = null;
  private pointer = new THREE.Vector2();
  private gesture: "orbit" | "pan" = "orbit";
  private viewportHeight = 720;

  constructor(readonly camera: THREE.PerspectiveCamera) {
    this.applyImmediately();
  }

  pointerDown(event: PointerEvent): void {
    if (this.pointerId !== null) return;
    this.pointerId = event.pointerId;
    this.pointer.set(event.clientX, event.clientY);
    this.gesture =
      event.button === 2 || event.shiftKey || event.altKey ? "pan" : "orbit";
  }

  pointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    const dx = event.clientX - this.pointer.x;
    const dy = event.clientY - this.pointer.y;
    this.pointer.set(event.clientX, event.clientY);

    if (this.gesture === "pan") {
      this.panVelocity.set(dx, dy).multiplyScalar(this.reducedMotion ? 1 : 0.8);
      this.panByPixels(dx, dy);
      return;
    }

    this.velocity.set(dx, dy).multiplyScalar(this.reducedMotion ? 1 : 0.65);
    this.targetSpherical.theta -= dx * 0.0042;
    this.targetSpherical.phi = THREE.MathUtils.clamp(
      this.targetSpherical.phi + dy * 0.0038,
      0.08,
      Math.PI - 0.08,
    );
  }

  pointerUp(event: PointerEvent): void {
    if (event.pointerId === this.pointerId) this.pointerId = null;
  }

  wheel(event: WheelEvent): void {
    const factor = Math.exp(event.deltaY * 0.0011);
    this.targetSpherical.radius = THREE.MathUtils.clamp(
      this.targetSpherical.radius * factor,
      this.bounds.minRadius,
      this.bounds.maxRadius,
    );
  }

  setBounds(bounds: Partial<CameraBounds>): void {
    this.bounds = { ...this.bounds, ...bounds };
    this.targetSpherical.radius = THREE.MathUtils.clamp(
      this.targetSpherical.radius,
      this.bounds.minRadius,
      this.bounds.maxRadius,
    );
    this.clampFocus(this.targetFocus);
  }

  translateFocus(delta: THREE.Vector3): void {
    this.targetFocus.add(delta);
    this.focus.add(delta);
    this.camera.position.add(delta);
  }

  setViewportHeight(height: number): void {
    this.viewportHeight = Math.max(1, height);
  }

  frameSphere(center: THREE.Vector3, radius: number): void {
    this.targetFocus.copy(center);
    this.clampFocus(this.targetFocus);
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
    const visualRadius = Math.max(radius, 1.35);
    this.targetSpherical.radius = THREE.MathUtils.clamp(
      visualRadius / Math.sin(halfFov) + visualRadius * 0.42,
      this.bounds.minRadius,
      this.bounds.maxRadius,
    );
    if (this.reducedMotion) this.applyImmediately();
  }

  setView(
    focus: THREE.Vector3,
    cameraPosition: THREE.Vector3,
    immediate = false,
  ): void {
    this.targetFocus.copy(focus);
    this.clampFocus(this.targetFocus);
    const offset = cameraPosition.clone().sub(this.targetFocus);
    this.targetSpherical.setFromVector3(offset);
    this.targetSpherical.radius = THREE.MathUtils.clamp(
      this.targetSpherical.radius,
      this.bounds.minRadius,
      this.bounds.maxRadius,
    );
    this.targetSpherical.phi = THREE.MathUtils.clamp(
      this.targetSpherical.phi,
      0.08,
      Math.PI - 0.08,
    );
    if (immediate || this.reducedMotion) this.applyImmediately();
  }

  update(dt: number): void {
    const smooth = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 7.5);
    this.spherical.radius = THREE.MathUtils.lerp(
      this.spherical.radius,
      this.targetSpherical.radius,
      smooth,
    );
    this.spherical.phi = THREE.MathUtils.lerp(
      this.spherical.phi,
      this.targetSpherical.phi,
      smooth,
    );
    this.spherical.theta = THREE.MathUtils.lerp(
      this.spherical.theta,
      this.targetSpherical.theta,
      smooth,
    );
    this.focus.lerp(this.targetFocus, smooth);

    if (this.pointerId === null && !this.reducedMotion) {
      this.targetSpherical.theta -= this.velocity.x * 0.0009;
      this.targetSpherical.phi = THREE.MathUtils.clamp(
        this.targetSpherical.phi + this.velocity.y * 0.00075,
        0.08,
        Math.PI - 0.08,
      );
      this.velocity.multiplyScalar(Math.exp(-dt * 7));
      this.panVelocity.multiplyScalar(Math.exp(-dt * 9));
    }

    this.applyCamera();
  }

  private panByPixels(dx: number, dy: number): void {
    const distance = this.targetSpherical.radius;
    const scale =
      (2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) /
      this.viewportHeight;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    this.targetFocus.addScaledVector(right, -dx * scale);
    this.targetFocus.addScaledVector(up, dy * scale);
    this.clampFocus(this.targetFocus);
  }

  private clampFocus(point: THREE.Vector3): void {
    const max = this.bounds.scenarioRadius;
    if (point.lengthSq() > max * max) point.setLength(max);
  }

  private applyImmediately(): void {
    this.spherical.copy(this.targetSpherical);
    this.focus.copy(this.targetFocus);
    this.applyCamera();
  }

  private applyCamera(): void {
    this.camera.position.setFromSpherical(this.spherical).add(this.focus);
    const exclusion = this.bounds.exclusionRadius + 2;
    if (this.camera.position.lengthSq() < exclusion * exclusion) {
      if (this.camera.position.lengthSq() < 0.001) {
        this.camera.position.set(0, exclusion * 0.32, exclusion);
      } else {
        this.camera.position.setLength(exclusion);
      }
    }
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
  }
}
