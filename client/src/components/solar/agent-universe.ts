import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { AgentRole } from "@shared/schema";
import { CameraController } from "./camera-controller";
import { createSolarBlackHole } from "./black-hole";
import { createSolarSky } from "./sky";
import { createPlanetAssets, animatePlanet } from "./planet-assets";
import {
  createAgentWorlds,
  orbitPosition,
  preserveOrbitalPhase,
  STATUS_COLOR,
  type AgentState,
  type AgentWorld,
} from "./layout";

interface Callbacks {
  onInspect(id: string): void;
  onHover(id: string | null): void;
  onReady(): void;
  onError(message: string): void;
  onCameraMode(mode: "orbit" | "alien"): void;
}
interface RenderWorld {
  model: AgentWorld;
  mesh: THREE.Object3D;
  label: HTMLButtonElement;
  orbit: THREE.LineLoop;
}

/** Render-only adapter: repository state and plan actions remain owned by React. */
export class AgentUniverse {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 12000);
  readonly controls = new CameraController(this.camera);
  private readonly assets = createPlanetAssets();
  private readonly core = createSolarBlackHole();
  private readonly sky = createSolarSky();
  private readonly composer: EffectComposer;
  private readonly labels: HTMLDivElement;
  private readonly worlds = new Map<string, RenderWorld>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly scratch = new THREE.Vector3();
  private readonly frameDelta = new THREE.Vector3();
  private readonly alienPosition = new THREE.Vector3();
  private spaceship: THREE.Object3D | null = null;
  private spaceshipLoading = false;
  private mode: "orbit" | "alien" = "orbit";
  private requestedMode: "orbit" | "alien" = "orbit";
  private selected: string | null = null;
  private time = 0;
  private paused = false;
  private reducedMotion = false;
  private width = 1;
  private height = 1;
  private extent = 390;
  private disposed = false;
  private dpr = 1.5;
  private averageFrame = 1 / 60;
  private qualityTime = 0;
  private pointerStart: { x: number; y: number; id: number } | null = null;
  private hovered: string | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
    private readonly callbacks: Callbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.setClearColor(0x030608);
    this.scene.add(
      this.core.mesh,
      this.sky.group,
      new THREE.AmbientLight(0x63819d, 0.22),
    );
    const light = new THREE.PointLight(0xffebcb, 3.8, 0, 0);
    light.position.set(0, 8, 0);
    this.scene.add(light);
    const key = new THREE.DirectionalLight(0x9ac2e5, 0.65);
    key.position.set(-180, 250, 250);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x58758c, 0.28);
    rim.position.set(100, -200, -200);
    this.scene.add(rim);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(1, 1), 0.49, 0.6, 1.15),
    );
    this.composer.addPass(new OutputPass());
    this.labels = document.createElement("div");
    this.labels.className = "agent-world-labels";
    this.labels.setAttribute("aria-hidden", "true");
    host.append(this.labels);
    this.controls.bounds = {
      minRadius: 32,
      maxRadius: 4000,
      scenarioRadius: 2000,
      exclusionRadius: 20,
    };
    void this.assets.texturesReady
      .then(async () => {
        if (this.disposed) return;
        await this.renderer.compileAsync(this.scene, this.camera);
        if (!this.disposed) {
          this.canvas.dataset.ready = "true";
          this.callbacks.onReady();
        }
      })
      .catch(() => {
        if (!this.disposed)
          this.callbacks.onError(
            "Some planet surfaces could not load. Reload this page to retry.",
          );
      });
  }
  setData(roles: AgentRole[], states: AgentState[]) {
    const selectedPosition = this.selected
      ? this.worlds.get(this.selected)?.mesh.position.clone()
      : undefined;
    const definitions = createAgentWorlds(roles, states);
    const ids = new Set(definitions.map((world) => world.id));
    for (const [id, world] of this.worlds) {
      if (!ids.has(id)) {
        this.scene.remove(world.mesh, world.orbit);
        world.orbit.geometry.dispose();
        (world.orbit.material as THREE.Material).dispose();
        world.label.remove();
        this.worlds.delete(id);
      }
    }
    const previousExtent = this.extent;
    this.extent = Math.max(
      125,
      ...definitions.map((world) => world.orbitRadius + world.radius * 2.8),
    );
    definitions.forEach((model) => {
      let world = this.worlds.get(model.id);
      if (world) model = preserveOrbitalPhase(world.model, model, this.time);
      const template = this.assets.templates[model.theme];
      if (world && world.model.theme !== model.theme) {
        this.scene.remove(world.mesh);
        world.mesh = template.mesh.clone(true);
        this.scene.add(world.mesh);
      }
      if (!world) {
        const mesh = template.mesh.clone(true);
        const label = document.createElement("button");
        label.type = "button";
        label.tabIndex = -1;
        label.className = "agent-world-label";
        label.addEventListener("click", () =>
          this.callbacks.onInspect(model.id),
        );
        label.addEventListener("pointerenter", () => this.setHover(model.id));
        label.addEventListener("pointerleave", () => this.setHover(null));
        const orbit = new THREE.LineLoop(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({
            color: 0x7c9cab,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
          }),
        );
        world = { model, mesh, label, orbit };
        this.worlds.set(model.id, world);
        this.scene.add(mesh, orbit);
        this.labels.append(label);
      }
      world.model = model;
      world.mesh.name = model.name;
      world.mesh.scale.setScalar(model.radius / template.radius);
      world.mesh.position.set(...orbitPosition(model, this.time));
      world.label.textContent = model.name;
      world.label.title = `${model.name} · ${model.status}`;
      world.label.style.setProperty(
        "--agent-status",
        `#${(STATUS_COLOR[model.status] ?? 0x9fa8bd).toString(16).padStart(6, "0")}`,
      );
      const points = Array.from({ length: 192 }, (_, i) => {
        const angle = (i / 192) * Math.PI * 2;
        return new THREE.Vector3(
          Math.cos(angle) * model.orbitRadius,
          Math.sin(angle) * Math.sin(model.inclination) * model.orbitRadius,
          Math.sin(angle) * Math.cos(model.inclination) * model.orbitRadius,
        );
      });
      world.orbit.geometry.dispose();
      world.orbit.geometry = new THREE.BufferGeometry().setFromPoints(points);
      (world.orbit.material as THREE.LineBasicMaterial).color.setHex(
        model.status === "drifting" ? STATUS_COLOR.drifting : 0x7c9cab,
      );
      (world.orbit.material as THREE.LineBasicMaterial).opacity =
        model.status === "drifting" ? 0.28 : 0.17;
    });
    const lostSelection = !!this.selected && !this.worlds.has(this.selected);
    if (lostSelection) this.selected = null;
    if (this.selected && selectedPosition) {
      const world = this.worlds.get(this.selected)!;
      this.controls.translateFocus(
        this.frameDelta.copy(world.mesh.position).sub(selectedPosition),
      );
    }
    this.controls.setBounds({
      maxRadius: Math.max(2000, this.extent * 8),
      scenarioRadius: this.extent * 1.7,
    });
    if (
      !this.selected &&
      (lostSelection || previousExtent !== this.extent || this.width === 1)
    )
      this.reset(true);
    this.canvas.dataset.worldCount = String(roles.length);
  }
  resize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.controls.setViewportHeight(this.height);
    this.dpr = Math.min(window.devicePixelRatio, 1.5);
    this.setResolution();
    if (!this.selected && this.mode === "orbit") this.reset(true);
  }
  private setResolution() {
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(this.width, this.height);
    this.sky.material.uniforms.uDpr.value = this.dpr;
  }
  setMotion(paused: boolean, reducedMotion: boolean) {
    this.paused = paused;
    this.reducedMotion = reducedMotion;
    this.controls.reducedMotion = reducedMotion;
    this.canvas.dataset.motion = paused ? "paused" : "running";
  }
  reset(immediate = false) {
    this.selected = null;
    this.mode = "orbit";
    this.requestedMode = "orbit";
    const v = THREE.MathUtils.degToRad(21),
      h = Math.atan(Math.tan(v) * this.camera.aspect);
    const distance = Math.max(
      (this.extent * 1.12) / Math.sin(h),
      (this.extent * 0.65) / Math.sin(v),
    );
    const focus = new THREE.Vector3(0, -this.extent * 0.065, 0);
    const position = new THREE.Vector3(
      0.14,
      this.camera.aspect < 0.85 ? 1.15 : 0.34,
      0.93,
    )
      .normalize()
      .multiplyScalar(distance)
      .add(focus);
    this.controls.velocity.set(0, 0);
    this.controls.setView(focus, position, immediate);
    this.canvas.dataset.focus = "overview";
  }
  focus(id: string) {
    const world = this.worlds.get(id);
    if (!world) return;
    this.mode = "orbit";
    this.requestedMode = "orbit";
    this.selected = id;
    const center = world.mesh.position;
    const toward = center.clone().negate().normalize();
    const tangent = new THREE.Vector3(-toward.z, 0, toward.x);
    const direction = toward.multiplyScalar(0.72).addScaledVector(tangent, 0.7);
    direction.y = 0.4;
    direction.normalize();
    this.controls.velocity.set(0, 0);
    this.controls.setView(
      center,
      center
        .clone()
        .addScaledVector(
          direction,
          world.model.radius * (this.camera.aspect < 0.85 ? 12 : 8),
        ),
    );
    this.canvas.dataset.focus = id;
  }
  setCameraMode(mode: "orbit" | "alien") {
    this.requestedMode = mode;
    if (mode === "orbit") {
      this.reset();
      return;
    }
    if (!this.spaceship) {
      if (this.spaceshipLoading) return;
      this.spaceshipLoading = true;
      new GLTFLoader().load(
        "/models/alien-riding.glb",
        (gltf) => {
          this.spaceshipLoading = false;
          if (this.disposed) {
            this.disposeSpaceship(gltf.scene);
            return;
          }
          const bounds = new THREE.Box3().setFromObject(gltf.scene),
            size = bounds.getSize(new THREE.Vector3());
          const center = bounds.getCenter(new THREE.Vector3());
          gltf.scene.position.sub(center);
          const root = new THREE.Group();
          root.add(gltf.scene);
          root.scale.setScalar(12 / Math.max(size.x, size.y, size.z));
          this.spaceship = root;
          this.scene.add(root);
          if (this.requestedMode === "alien") this.setCameraMode("alien");
        },
        undefined,
        () => {
          this.spaceshipLoading = false;
          if (!this.disposed) {
            this.callbacks.onCameraMode("orbit");
            this.callbacks.onError(
              "Spaceship model could not load. Solar orbit controls are still available.",
            );
          }
        },
      );
      return;
    }
    this.mode = "alien";
    this.selected = null;
    this.updateSpaceship();
    this.controls.velocity.set(0, 0);
    this.controls.setView(
      this.alienPosition,
      this.alienPosition.clone().add(new THREE.Vector3(22, 10, 29)),
    );
    this.canvas.dataset.focus = "spaceship";
  }
  private updateSpaceship() {
    if (!this.spaceship) return;
    const t = this.time * 0.04;
    this.scratch.set(
      Math.cos(t) * this.extent * 0.6,
      Math.sin(t * 0.7) * 40 + 20,
      Math.sin(t) * this.extent * 0.55,
    );
    this.frameDelta.copy(this.scratch).sub(this.alienPosition);
    if (this.mode === "alien") this.controls.translateFocus(this.frameDelta);
    this.alienPosition.copy(this.scratch);
    this.spaceship.position.copy(this.alienPosition);
    this.spaceship.lookAt(
      Math.cos(t + 0.01) * this.extent * 0.6,
      Math.sin((t + 0.01) * 0.7) * 40 + 20,
      Math.sin(t + 0.01) * this.extent * 0.55,
    );
    this.spaceship.rotateY(Math.PI);
  }
  frame(dt: number) {
    if (this.disposed) return;
    const step = Math.min(0.05, Math.max(0, Number.isFinite(dt) ? dt : 0));
    if (!this.paused) this.time += step;
    for (const world of this.worlds.values()) {
      this.scratch.set(...orbitPosition(world.model, this.time));
      if (world.model.id === this.selected)
        this.controls.translateFocus(
          this.frameDelta.copy(this.scratch).sub(world.mesh.position),
        );
      world.mesh.position.copy(this.scratch);
      if (!this.paused) animatePlanet(world.mesh, step);
    }
    this.updateSpaceship();
    this.controls.update(step);
    this.core.update(this.camera, this.time);
    this.sky.group.position.copy(this.camera.position);
    this.composer.render(step);
    this.updateLabels();
    this.averageFrame = THREE.MathUtils.lerp(
      this.averageFrame,
      Math.min(0.15, dt),
      0.025,
    );
    this.qualityTime += step;
    if (this.qualityTime > 3) {
      this.qualityTime = 0;
      const target =
        this.averageFrame > 1 / 43
          ? Math.max(0.8, this.dpr - 0.15)
          : this.averageFrame < 1 / 57
            ? Math.min(window.devicePixelRatio, 1.5, this.dpr + 0.1)
            : this.dpr;
      if (Math.abs(target - this.dpr) > 0.02) {
        this.dpr = target;
        this.setResolution();
      }
    }
  }
  private updateLabels() {
    const occupied: Array<{ x: number; y: number; width: number }> = [];
    for (const world of this.worlds.values()) {
      const projected = this.scratch
        .copy(world.mesh.position)
        .project(this.camera);
      const x = ((projected.x + 1) * this.width) / 2;
      const radius =
        (((world.model.radius /
          world.mesh.position.distanceTo(this.camera.position)) *
          this.height) /
          Math.tan(THREE.MathUtils.degToRad(21))) *
        0.5;
      const y = ((1 - projected.y) * this.height) / 2 + radius + 12;
      const labelWidth = Math.min(
        this.width < 600 ? 120 : 160,
        world.model.name.length * 6 + 28,
      );
      const collision = occupied.some(
        (p) =>
          x < p.x + p.width + 8 &&
          x + labelWidth + 8 > p.x &&
          Math.abs(y - p.y) < 30,
      );
      world.label.hidden =
        this.selected !== null ||
        this.mode === "alien" ||
        projected.z < 0 ||
        projected.z > 1 ||
        x < 12 ||
        x + labelWidth > this.width - 12 ||
        y < 90 ||
        y > this.height - (this.width < 600 ? 280 : 185) ||
        collision;
      if (!world.label.hidden) {
        world.label.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
        occupied.push({ x, y, width: labelWidth });
      }
    }
  }
  private pick(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      (-(clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(
      [...this.worlds.values()].map((w) => w.mesh),
      true,
    )[0];
    if (!hit) return null;
    for (const world of this.worlds.values()) {
      let object: THREE.Object3D | null = hit.object;
      while (object) {
        if (object === world.mesh) return world.model.id;
        object = object.parent;
      }
    }
    return null;
  }
  private setHover(id: string | null) {
    if (this.hovered === id) return;
    this.hovered = id;
    this.canvas.style.cursor = id ? "pointer" : "grab";
    this.callbacks.onHover(id);
  }
  pointerDown(event: PointerEvent) {
    this.pointerStart = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
    };
    this.canvas.setPointerCapture(event.pointerId);
    this.controls.pointerDown(event);
  }
  pointerMove(event: PointerEvent) {
    this.controls.pointerMove(event);
    if (!this.pointerStart)
      this.setHover(this.pick(event.clientX, event.clientY));
  }
  pointerUp(event: PointerEvent) {
    this.controls.pointerUp(event);
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
    if (
      event.button === 0 &&
      this.pointerStart?.id === event.pointerId &&
      Math.hypot(
        event.clientX - this.pointerStart.x,
        event.clientY - this.pointerStart.y,
      ) < 5
    ) {
      const id = this.pick(event.clientX, event.clientY);
      if (id) this.callbacks.onInspect(id);
    }
    this.pointerStart = null;
  }
  pointerLeave() {
    this.setHover(null);
  }
  pointerCancel(event: PointerEvent) {
    this.controls.pointerUp(event);
    this.pointerStart = null;
    this.setHover(null);
  }
  wheel(event: WheelEvent) {
    event.preventDefault();
    this.controls.wheel(event);
  }
  private disposeSpaceship(root: THREE.Object3D) {
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) value.dispose();
          material.dispose();
        }
      }
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.labels.remove();
    for (const world of this.worlds.values()) {
      world.orbit.geometry.dispose();
      (world.orbit.material as THREE.Material).dispose();
    }
    this.worlds.clear();
    if (this.spaceship) this.disposeSpaceship(this.spaceship);
    this.assets.dispose();
    this.core.dispose();
    this.sky.dispose();
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
