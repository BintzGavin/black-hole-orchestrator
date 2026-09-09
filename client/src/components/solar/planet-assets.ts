import * as THREE from "three";

export interface SolarBody {
  id: string;
  name: string;
  mesh: THREE.Object3D;
  radius: number;
  orbitRadius: number;
  description: string;
  kind: string;
}

export interface PlanetAssetLibrary {
  templates: SolarBody[];
  texturesReady: Promise<void>;
  update(dt: number, paused: boolean): void;
  dispose(): void;
}

interface WorldDefinition {
  id: string;
  name: string;
  kind: string;
  description: string;
  radius: number;
  orbitRadius: number;
  angle: number;
  inclination: number;
  tilt: number;
  spin: number;
  color: number;
  atmosphere?: number;
  roughness: number;
  bump?: number;
}

const worlds: readonly WorldDefinition[] = [
  {
    id: "cinder",
    name: "Cinder",
    kind: "Volcanic world",
    description:
      "A fractured basalt world at the edge of the accretion field. Copper ridges, ancient impact basins, and incandescent faults mark its restless surface.",
    radius: 5,
    orbitRadius: 70,
    angle: -0.6,
    inclination: 0.015,
    tilt: 0.08,
    spin: 0.045,
    color: 0xbb774c,
    roughness: 0.97,
    bump: 0.19,
  },
  {
    id: "verdant",
    name: "Verdant",
    kind: "Ocean world",
    description:
      "Teal oceans surround weathered continents beneath slowly drifting cloud systems. A thin azure atmosphere catches the light along its curved horizon.",
    radius: 9,
    orbitRadius: 110,
    angle: 2.55,
    inclination: -0.025,
    tilt: 0.24,
    spin: 0.026,
    color: 0x3a888a,
    atmosphere: 0x56cbd9,
    roughness: 0.72,
    bump: 0.085,
  },
  {
    id: "aurelia",
    name: "Aurelia",
    kind: "Ringed gas giant",
    description:
      "A vast gold atmosphere crossed by turbulent jet streams and a persistent oval storm. Countless icy particles trace a finely divided equatorial ring system.",
    radius: 16,
    orbitRadius: 160,
    angle: 0.48,
    inclination: 0.045,
    tilt: 0.43,
    spin: 0.046,
    color: 0xd5b983,
    atmosphere: 0xefc98b,
    roughness: 1,
  },
  {
    id: "glacial",
    name: "Glacial",
    kind: "Fractured ice world",
    description:
      "An ancient shell of blue ice is split by dark tectonic seams. Frost-bright highlands and buried mineral bands record a long history beneath the frozen surface.",
    radius: 11,
    orbitRadius: 215,
    angle: 3.75,
    inclination: -0.018,
    tilt: -0.16,
    spin: 0.018,
    color: 0xaed3df,
    atmosphere: 0x7ed7f1,
    roughness: 0.47,
    bump: 0.12,
  },
  {
    id: "rust",
    name: "Rust",
    kind: "Desert world",
    description:
      "Iron-rich deserts cover a cratered terrestrial world. Wind-worn strata, rust-red basins, and pale polar deposits emerge as the planet turns into the light.",
    radius: 8,
    orbitRadius: 275,
    angle: 1.9,
    inclination: 0.035,
    tilt: 0.34,
    spin: 0.022,
    color: 0xcf8955,
    atmosphere: 0xe59b73,
    roughness: 1,
    bump: 0.17,
  },
  {
    id: "nereid",
    name: "Nereid",
    kind: "Outer ice giant",
    description:
      "Cobalt cloud decks circle the distant giant. High-altitude methane haze, delicate bright clouds, and a deep atmospheric vortex break its cold blue bands.",
    radius: 14,
    orbitRadius: 340,
    angle: 5.2,
    inclination: -0.038,
    tilt: -0.29,
    spin: 0.034,
    color: 0x357ac3,
    atmosphere: 0x628efb,
    roughness: 1,
  },
];

/**
 * Original Blender-authored planet styles for arbitrary orchestration roles.
 * Clone template meshes with clone(true): geometry, material, and texture assets
 * remain shared. Dispose this library only after removing all of its clones.
 */
export function createPlanetAssets(): PlanetAssetLibrary {
  const group = new THREE.Group();
  group.name = "Solar worlds";
  const bodies: SolarBody[] = [];
  const textures = new Set<THREE.Texture>();
  const textureCache = new Map<string, THREE.Texture>();
  const textureLoads: Promise<void>[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  let disposed = false;

  const texture = (filename: string, color = false): THREE.Texture => {
    const key = `${filename}:${color}`;
    const cached = textureCache.get(key);
    if (cached) return cached;
    let map: THREE.Texture;
    if (typeof document === "undefined") {
      map = new THREE.Texture();
    } else {
      let loadedTexture: THREE.Texture | undefined;
      const ready = new Promise<void>((resolve, reject) => {
        loadedTexture = new THREE.TextureLoader().load(
          `/assets/solar/${filename}.${filename.endsWith("-color") ? "jpg" : "png"}`,
          (loaded) => {
            if (disposed) loaded.dispose();
            resolve();
          },
          undefined,
          () => reject(new Error(`Solar texture failed to load: ${filename}`)),
        );
      });
      // Register a handler immediately. The public aggregate still rejects so
      // callers can show an explicit recovery state without console noise.
      void ready.catch(() => {});
      textureLoads.push(ready);
      map = loadedTexture!;
    }
    map.name = filename;
    map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.anisotropy = 8;
    textures.add(map);
    textureCache.set(key, map);
    return map;
  };

  const sphere = (
    radius: number,
    width = 96,
    height = 64,
  ): THREE.SphereGeometry => {
    const geometry = new THREE.SphereGeometry(radius, width, height);
    geometries.add(geometry);
    return geometry;
  };

  const registerMaterial = <T extends THREE.Material>(material: T): T => {
    materials.add(material);
    return material;
  };

  const atmosphere = (radius: number, tint: number): THREE.Mesh => {
    const material = registerMaterial(
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(tint) } },
        vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
        fragmentShader: `
        uniform vec3 color;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        void main() {
          vec3 normal = normalize(vWorldNormal);
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          vec3 lightDirection = normalize(-vWorldPosition);
          float mu = max(dot(normal, viewDirection), 0.0);
          float rim = pow(1.0 - mu, 4.2);
          float day = smoothstep(-0.24, 0.42, dot(normal, lightDirection));
          float alpha = rim * (0.12 + 0.48 * day);
          gl_FragColor = vec4(color * (0.65 + 0.35 * day), alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
        toneMapped: true,
      }),
    );
    const shell = new THREE.Mesh(sphere(radius * 1.027), material);
    shell.name = "Atmospheric limb";
    shell.renderOrder = 3;
    return shell;
  };

  for (const world of worlds) {
    const root = new THREE.Group();
    root.name = world.name;
    root.userData.planetStyleId = world.id;
    // Templates are centered at the origin; the live role graph controls layout.
    root.position.set(0, 0, 0);
    // Tilting the entire local system keeps clouds and rings on the same axis.
    const axialFrame = new THREE.Group();
    axialFrame.rotation.z = world.tilt;
    root.add(axialFrame);
    const map = texture(`${world.id}-color`, true);
    const surfaceMaterial = registerMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map,
        roughness: world.roughness,
        metalness: 0,
        envMapIntensity: 0.3,
      }),
    );
    if (world.bump) {
      surfaceMaterial.bumpMap = texture(`${world.id}-height`);
      surfaceMaterial.bumpScale = world.bump;
    }
    if (world.id === "verdant") {
      surfaceMaterial.roughnessMap = texture("verdant-roughness");
      surfaceMaterial.roughness = 1;
    }
    if (world.id === "cinder") {
      surfaceMaterial.emissiveMap = texture("cinder-emission", true);
      surfaceMaterial.emissive.set(0xff9f50);
      surfaceMaterial.emissiveIntensity = 1.8;
    }
    const surface = new THREE.Mesh(sphere(world.radius), surfaceMaterial);
    surface.name = `${world.name} surface`;
    surface.rotation.y = world.angle + 0.8;
    surface.castShadow = true;
    surface.receiveShadow = true;
    axialFrame.add(surface);
    surface.userData.planetRotationSpeed = world.spin;

    if (world.atmosphere)
      axialFrame.add(atmosphere(world.radius, world.atmosphere));
    if (world.id === "verdant") {
      const cloudMaterial = registerMaterial(
        new THREE.MeshStandardMaterial({
          color: 0xeafaff,
          alphaMap: texture("verdant-clouds"),
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
          roughness: 1,
          metalness: 0,
        }),
      );
      const clouds = new THREE.Mesh(
        sphere(world.radius * 1.012),
        cloudMaterial,
      );
      clouds.name = "High altitude weather";
      clouds.rotation.y = surface.rotation.y;
      clouds.renderOrder = 2;
      axialFrame.add(clouds);
      clouds.userData.planetRotationSpeed = world.spin * 1.11;
    }
    if (world.id === "aurelia") {
      const inner = world.radius * 1.38;
      const outer = world.radius * 2.26;
      const geometry = new THREE.RingGeometry(inner, outer, 192, 1);
      const position = geometry.getAttribute("position");
      const uv = geometry.getAttribute("uv");
      for (let index = 0; index < position.count; index++) {
        const radial = Math.hypot(position.getX(index), position.getY(index));
        uv.setXY(index, (radial - inner) / (outer - inner), 0.5);
      }
      geometries.add(geometry);
      const ringMaterial = registerMaterial(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: texture("aurelia-rings", true),
          alphaMap: texture("aurelia-ring-alpha"),
          transparent: true,
          opacity: 0.93,
          alphaTest: 0.025,
          side: THREE.DoubleSide,
          depthWrite: false,
          roughness: 1,
          metalness: 0,
        }),
      );
      // A geometric eclipse keeps the planet's shadow on the rings accurate
      // without an expensive point-light cube shadow map for the whole system.
      ringMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.solarPlanetRadius = { value: world.radius };
        shader.vertexShader = `uniform float solarPlanetRadius;\nvarying float vSolarPlanetRadius;\nvarying vec3 vSolarRingPosition;\nvarying vec3 vSolarPlanetCenter;\n${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <worldpos_vertex>",
          `
          #include <worldpos_vertex>
          vSolarRingPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          vSolarPlanetCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vSolarPlanetRadius = solarPlanetRadius * length(modelMatrix[0].xyz);
        `,
        );
        shader.fragmentShader = `varying float vSolarPlanetRadius;\nvarying vec3 vSolarRingPosition;\nvarying vec3 vSolarPlanetCenter;\n${shader.fragmentShader}`;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <lights_fragment_end>",
          `
          #include <lights_fragment_end>
          vec3 solarLightDirection = normalize(-vSolarRingPosition);
          vec3 solarToCenter = vSolarPlanetCenter - vSolarRingPosition;
          float solarAlongRay = dot(solarToCenter, solarLightDirection);
          float solarClosest = length(solarToCenter - solarLightDirection * solarAlongRay);
          float solarEclipse = step(0.0, solarAlongRay) *
            (1.0 - smoothstep(vSolarPlanetRadius * 0.985, vSolarPlanetRadius * 1.025, solarClosest));
          reflectedLight.directDiffuse *= 1.0 - solarEclipse * 0.96;
          reflectedLight.directSpecular *= 1.0 - solarEclipse * 0.96;
        `,
        );
      };
      ringMaterial.customProgramCacheKey = () =>
        "solar-ring-eclipse-scalable-v2";
      const rings = new THREE.Mesh(geometry, ringMaterial);
      rings.name = "Aurelia ice particle rings";
      rings.rotation.x = -Math.PI / 2;
      rings.castShadow = true;
      rings.receiveShadow = true;
      axialFrame.add(rings);
    }
    if (
      world.id === "verdant" ||
      world.id === "aurelia" ||
      world.id === "nereid"
    ) {
      const moonRadius =
        world.id === "aurelia" ? 2.4 : world.id === "nereid" ? 1.8 : 1.55;
      const moonDistance = world.radius * (world.id === "aurelia" ? 2.95 : 2.1);
      const moonOrbit = new THREE.Group();
      moonOrbit.name = `${world.name} satellite orbit`;
      moonOrbit.rotation.set(0.18, world.id === "aurelia" ? 1.9 : -0.8, -0.12);
      const moonMaterial = registerMaterial(
        new THREE.MeshStandardMaterial({
          map: texture("moon-color", true),
          bumpMap: texture("moon-height"),
          bumpScale: 0.08,
          roughness: 1,
          metalness: 0,
          color: world.id === "nereid" ? 0xc6d9ee : 0xffffff,
        }),
      );
      const moon = new THREE.Mesh(sphere(moonRadius, 48, 32), moonMaterial);
      moon.name =
        world.id === "verdant"
          ? "Luma"
          : world.id === "aurelia"
            ? "Vesper"
            : "Thalassa";
      moon.position.set(moonDistance, 0, 0);
      moon.castShadow = true;
      moon.receiveShadow = true;
      moonOrbit.add(moon);
      root.add(moonOrbit);
      moonOrbit.userData.planetRotationSpeed = world.spin * 0.22;
      moon.userData.planetRotationSpeed = world.spin * 0.31;
    }
    root.traverse((object) => {
      object.userData.planetStyleId = world.id;
      object.userData.planetStyleName = world.name;
    });
    group.add(root);
    bodies.push({
      id: world.id,
      name: world.name,
      mesh: root,
      radius: world.radius,
      orbitRadius: world.orbitRadius,
      description: world.description,
      kind: world.kind,
    });
  }

  const texturesReady = Promise.all(textureLoads).then(() => {});
  void texturesReady.catch(() => {});

  return {
    templates: bodies,
    texturesReady,
    update(dt, paused) {
      if (disposed || paused) return;
      for (const body of bodies) animatePlanet(body.mesh, dt);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((map) => map.dispose());
    },
  };
}

/** Animate a role's cloned world without coupling visual styles to live roles. */
export function animatePlanet(root: THREE.Object3D, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  // Limit resume jumps after a background tab, while preserving frame timing.
  const step = Math.min(dt, 0.1);
  root.traverse((object) => {
    const speed: unknown = object.userData.planetRotationSpeed;
    if (typeof speed !== "number" || !Number.isFinite(speed)) return;
    object.rotation.y = (object.rotation.y + step * speed) % (Math.PI * 2);
  });
}
