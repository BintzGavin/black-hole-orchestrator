import React, { useRef, useEffect, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshDistortMaterial, MeshWobbleMaterial, Sparkles, Cloud, Clouds, Icosahedron, Dodecahedron, useGLTF, Clone } from "@react-three/drei";
import * as THREE from "three";

interface PlanetProps {
  baseSize: number;
  color: THREE.Color;
  activityLevel: number;
  isDrifting: boolean;
}

// ---------------------------------------------------------------------------
// Reusable GLB Planet wrapper
// ---------------------------------------------------------------------------
function GLBPlanet({
  modelPath,
  baseSize,
  isDrifting,
  atmosColor = "#ff3300",
  emissiveColor = "#ff1100",
  emissiveIntensity = 1.5,
  atmosOpacity = 0.0005,
  atmosScale = 1.0,
  spinSpeed = 0.3,
}: PlanetProps & {
  modelPath: string;
  atmosColor?: string;
  emissiveColor?: string;
  emissiveIntensity?: number;
  atmosOpacity?: number;
  atmosScale?: number;
  spinSpeed?: number;
}) {
  const { scene } = useGLTF(modelPath);
  const modelRef = useRef<THREE.Group>(null);
  const atmosRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (!isDrifting) {
      if (modelRef.current) modelRef.current.rotation.y += delta * spinSpeed;
      if (atmosRef.current) atmosRef.current.rotation.y += delta * spinSpeed * 0.5;
    }
  });

  return (
    <group>
      <Suspense
        fallback={
          <mesh>
            <sphereGeometry args={[baseSize * 1.0, 16, 16]} />
            <meshStandardMaterial color={atmosColor} emissive={emissiveColor} emissiveIntensity={0.5} />
          </mesh>
        }
      >
        <group ref={modelRef}>
          <Clone object={scene} scale={baseSize * 0.8} />
        </group>
      </Suspense>
      {/* Glowing atmosphere – additive blending so the GLB shows through */}
      <mesh ref={atmosRef}>
        <sphereGeometry args={[baseSize * atmosScale, 32, 32]} />
        <meshPhysicalMaterial
          color={atmosColor}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
          roughness={0.1}
          transparent
          opacity={atmosOpacity}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// 1. Molten Core – fiery lava planet
// ---------------------------------------------------------------------------
function MoltenCore(props: PlanetProps) {
  return (
    <GLBPlanet
      {...props}
      modelPath="/models/molten-core.glb"
      atmosColor="#ff3300"
      emissiveColor="#ff1100"
      emissiveIntensity={1.5}
      spinSpeed={0.2}
    />
  );
}

// ---------------------------------------------------------------------------
// 2. Azure Tempest – icy blue storm world
// ---------------------------------------------------------------------------
function AzureTempest(props: PlanetProps) {
  return (
    <GLBPlanet
      {...props}
      modelPath="/models/azure-tempest.glb"
      atmosColor="#00aaff"
      emissiveColor="#0066dd"
      emissiveIntensity={1.2}
      spinSpeed={0.35}
    />
  );
}

// ---------------------------------------------------------------------------
// 3. Emerald Neon – toxic green jungle
// ---------------------------------------------------------------------------
function EmeraldNeon(props: PlanetProps) {
  return (
    <GLBPlanet
      {...props}
      modelPath="/models/emerald-neon.glb"
      atmosColor="#00ff66"
      emissiveColor="#00cc44"
      emissiveIntensity={1.3}
      spinSpeed={0.15}
    />
  );
}

// ---------------------------------------------------------------------------
// 4. Ember Sphere – smoldering desert
// ---------------------------------------------------------------------------
function EmberSphere(props: PlanetProps) {
  return (
    <GLBPlanet
      {...props}
      modelPath="/models/ember-sphere.glb"
      atmosColor="#ff8800"
      emissiveColor="#ff5500"
      emissiveIntensity={1.0}
      spinSpeed={0.25}
    />
  );
}

// ---------------------------------------------------------------------------
// 5. Cosmic Rose – pink-purple nebula world
// ---------------------------------------------------------------------------
function CosmicRose(props: PlanetProps) {
  return (
    <GLBPlanet
      {...props}
      modelPath="/models/cosmic-rose.glb"
      atmosColor="#ff44aa"
      emissiveColor="#cc0066"
      emissiveIntensity={1.2}
      spinSpeed={0.4}
    />
  );
}

// ---------------------------------------------------------------------------
// 6. Iron Orb – metallic industrial world
// ---------------------------------------------------------------------------
function IronOrb(props: PlanetProps) {
  return (
    <GLBPlanet
      {...props}
      modelPath="/models/iron-orb.glb"
      atmosColor="#88aacc"
      emissiveColor="#4477aa"
      emissiveIntensity={0.8}
      spinSpeed={0.1}
    />
  );
}

// ---------------------------------------------------------------------------
// 7. Jovian Ringed – gas giant with rings
// ---------------------------------------------------------------------------
function JovianRinged(props: PlanetProps) {
  return (
    <GLBPlanet
      {...props}
      modelPath="/models/jovian-ringed.glb"
      atmosColor="#e4d6a7"
      emissiveColor="#cca466"
      emissiveIntensity={0.8}
      spinSpeed={0.08}
    />
  );
}

// ---------------------------------------------------------------------------
// 8. Molten Ember – volcanic cousin
// ---------------------------------------------------------------------------
function MoltenEmber(props: PlanetProps) {
  return (
    <GLBPlanet
      {...props}
      modelPath="/models/molten-ember.glb"
      atmosColor="#ff4400"
      emissiveColor="#cc2200"
      emissiveIntensity={1.4}
      spinSpeed={0.3}
    />
  );
}

// ---------------------------------------------------------------------------
// 9. Toxic Sulfur – procedural (no GLB)
// ---------------------------------------------------------------------------
function ToxicSulfur({ baseSize, isDrifting }: PlanetProps) {
  const atmosRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (atmosRef.current && !isDrifting) atmosRef.current.rotation.y += delta * 0.1;
  });
  return (
    <group>
      <mesh>
        <sphereGeometry args={[baseSize * 0.95, 32, 32]} />
        <meshStandardMaterial color="#e9b000" roughness={0.6} emissive="#ffaa00" emissiveIntensity={0.8} />
      </mesh>
      <mesh ref={atmosRef}>
        <sphereGeometry args={[baseSize * 1.05, 32, 32]} />
        <MeshDistortMaterial color="#b5e48c" emissive="#55ff55" emissiveIntensity={1.0} distort={0.15} speed={0.5} transparent opacity={0.4} roughness={0.8} />
      </mesh>
      {/* Acidic glowing orbit rings */}
      <mesh rotation={[Math.PI / 1.8, -0.2, 0]}>
        <ringGeometry args={[baseSize * 1.8, baseSize * 2.0, 32]} />
        <meshBasicMaterial color="#55ff55" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// 10. Alien Fractal – procedural geometric anomaly (no GLB)
// ---------------------------------------------------------------------------
function AlienFractal({ baseSize, isDrifting }: PlanetProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (meshRef.current && !isDrifting) {
      meshRef.current.rotation.x += delta * 0.1;
      meshRef.current.rotation.y += delta * 0.15;
    }
  });
  return (
    <group>
      <Dodecahedron ref={meshRef} args={[baseSize * 0.8, 1]}>
        <meshPhysicalMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={1.5} metalness={0.5} roughness={0.1} clearcoat={1} />
      </Dodecahedron>
      <mesh>
        <sphereGeometry args={[baseSize * 1.0, 32, 32]} />
        <meshPhysicalMaterial color="#ffffff" transmission={0.99} roughness={0.0} ior={1.1} transparent opacity={0.1} depthWrite={false} emissive="#ff00ff" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Preload all GLB models
// ---------------------------------------------------------------------------
useGLTF.preload('/models/molten-core.glb');
useGLTF.preload('/models/azure-tempest.glb');
useGLTF.preload('/models/emerald-neon.glb');
useGLTF.preload('/models/ember-sphere.glb');
useGLTF.preload('/models/cosmic-rose.glb');
useGLTF.preload('/models/iron-orb.glb');
useGLTF.preload('/models/jovian-ringed.glb');
useGLTF.preload('/models/molten-ember.glb');

// ---------------------------------------------------------------------------
// Main Selector Component
// ---------------------------------------------------------------------------
export function PlanetThemeRenderer({ 
  index, 
  baseSize, 
  color, 
  activityLevel, 
  isDrifting 
}: PlanetProps & { index: number }) {
  const themeIndex = index % 10;
  
  const props = { baseSize, color, activityLevel, isDrifting };
  
  switch (themeIndex) {
    case 0: return <MoltenCore {...props} />;
    case 1: return <AzureTempest {...props} />;
    case 2: return <EmeraldNeon {...props} />;
    case 3: return <EmberSphere {...props} />;
    case 4: return <CosmicRose {...props} />;
    case 5: return <IronOrb {...props} />;
    case 6: return <JovianRinged {...props} />;
    case 7: return <MoltenEmber {...props} />;
    case 8: return <ToxicSulfur {...props} />;
    case 9: return <AlienFractal {...props} />;
    default: return null;
  }
}
