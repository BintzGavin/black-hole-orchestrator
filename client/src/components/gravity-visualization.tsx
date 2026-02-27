import type { AgentRole } from "@shared/schema";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Line, Trail, Stars, Sparkles, Environment } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useRef, useMemo, useState, useEffect, Suspense } from "react";
import * as THREE from "three";
import { PlanetThemeRenderer } from "./planets";

interface GravityVisualizationProps {
  repoName: string;
  roles: AgentRole[];
  agentStates?: { agentName: string; currentStatus: string; recentTask: string }[];
  className?: string;
  onAgentClick?: (roleId: string) => void;
}

function getStatusColor(status: string | null): string {
  switch (status) {
    case "active":
      return "hsl(142, 76%, 36%)"; // Emerald
    case "saturated":
      return "hsl(43, 96%, 56%)"; // Amber
    case "drifting":
      return "hsl(0, 84%, 60%)"; // Red
    default:
      return "hsl(258, 90%, 66%)"; // Primary purple
  }
}

function AgentPlanet({ 
  role, 
  agentState,
  index, 
  totalRoles, 
  isGlobalPaused,
  setHoveredAgent,
  onAgentClick 
}: { 
  role: AgentRole, 
  agentState?: { agentName: string; currentStatus: string; recentTask: string },
  index: number, 
  totalRoles: number, 
  isGlobalPaused: boolean,
  setHoveredAgent: (id: string | null) => void,
  onAgentClick?: (roleId: string) => void 
}) {
  const groupRef = useRef<THREE.Group>(null);
  const planetRef = useRef<THREE.Mesh>(null);
  const moonsRef = useRef<THREE.Group>(null);
  const accumulatedTime = useRef(0);
  
  const actualStatus = agentState?.currentStatus || role.status;
  const colorStr = getStatusColor(actualStatus);
  const color = useMemo(() => new THREE.Color(colorStr), [colorStr]);
  const isDrifting = actualStatus === "drifting";
  const activityLevel = Math.min((role.prCount ?? 0) + (role.planCount ?? 0), 10);
  
  // SCALE INCREASED 2x: Much larger orbits so they are not clustered
  const radiusVariations = [60, 45, 75, 55, 40, 70]; 
  const durationVariations = [45, 35, 55, 40, 30, 60];
  const directionVariations = [1, -1, 1, 1, -1, 1];
  const inclinationVariations = [0.1, -0.2, 0.3, -0.25, 0.4, -0.15]; 
  
  const baseRadius = radiusVariations[index % radiusVariations.length];
  const direction = directionVariations[index % directionVariations.length];
  const inclination = inclinationVariations[index % inclinationVariations.length];
  
  const basePlanetSize = isDrifting ? 1.0 : 1.5 + activityLevel * 0.3;
  const speed = (isDrifting ? 0.4 : 1) * direction * (15 / durationVariations[index % durationVariations.length]);
  
  const [hovered, setHovered] = useState(false);
  
  const startAngle = (index / Math.max(totalRoles, 1)) * Math.PI * 2;
  
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    // Only increment time if the entire scene isn't paused by a hover
    if (!isGlobalPaused || hovered) {
      // If WE are the hovered one, actually wait, do we want to pause ourselves too?
      // "make all their orbits pause when hovering" -> this means even the hovered one pauses.
      // So ONLY accumulate time if NO node is globally hovered.
      if (!isGlobalPaused) {
        accumulatedTime.current += delta;
      }
    }
    
    // Time progress
    const t = accumulatedTime.current * speed + startAngle;
    
    // If drifting, expand radius outward
    let currentRadius = baseRadius;
    if (isDrifting) {
        currentRadius = baseRadius + (accumulatedTime.current * 3.0); 
    }
    
    // Flat orbit
    let x = Math.cos(t) * currentRadius;
    let z = Math.sin(t) * currentRadius;
    
    // Apply inclination (tilt the orbit)
    const tiltedY = Math.sin(inclination) * z;
    const tiltedZ = Math.cos(inclination) * z;
    
    // Drifting agents also wobble a bit
    const wobbleY = isDrifting ? Math.sin(accumulatedTime.current * 4) * 0.5 : 0;
    
    groupRef.current.position.set(x, tiltedY + wobbleY, tiltedZ);
  });

  const handlePointerOver = (e: any) => {
    e.stopPropagation();
    setHovered(true);
    setHoveredAgent(role.id);
    document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = (e: any) => {
    e.stopPropagation();
    setHovered(false);
    setHoveredAgent(null);
    document.body.style.cursor = 'auto';
  };

  const handleClick = (e: any) => {
    e.stopPropagation(); 
    if (onAgentClick) {
      onAgentClick(role.id);
    }
  };
  
  return (
    <group>
      <group 
        ref={groupRef}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        {/* Invisible hit sphere for easier clicking - 3x planet size */}
        <mesh visible={false}>
          <sphereGeometry args={[basePlanetSize, 16, 16]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
        
        {/* Procedural 3D Planet Theme */}
        <PlanetThemeRenderer 
          index={index} 
          baseSize={basePlanetSize} 
          color={color} 
          activityLevel={activityLevel} 
          isDrifting={isDrifting} 
        />
        
        <Html center distanceFactor={30} zIndexRange={[100, 0]} className="pointer-events-none">
          {/* We make the HTML label pointer-events-none so it doesn't block the 3D mesh click, but we want the visual hover */}
          <div className="flex flex-col items-center select-none" style={{ opacity: isDrifting ? 0.6 : 1, filter: hovered ? 'brightness(1.5)' : 'none' }}>
            <span 
               className={`text-white text-2xl font-black whitespace-nowrap drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)] px-3 py-1.5 rounded-lg transition-colors duration-200 ${hovered ? 'bg-black/60 scale-110 border border-white/20' : ''}`} 
               style={{ textShadow: `0 0 15px ${colorStr}, 0 0 30px ${colorStr}` }}
            >
              {role.name.length > 20 ? role.name.slice(0, 20) + "..." : role.name}
            </span>
            {agentState?.recentTask && hovered && (
              <div className="mt-2 text-sm text-white/90 bg-black/80 px-3 py-2 rounded-lg border border-white/20 max-w-xs text-center backdrop-blur-md animate-in fade-in zoom-in duration-200">
                <span className="opacity-60 text-xs block mb-1 uppercase tracking-wider">Current Focus</span>
                {agentState.recentTask}
              </div>
            )}
          </div>
        </Html>
      </group>
      
      {/* Visual Orbit Path */}
      {!isDrifting && (
        <Line 
          points={useMemo(() => {
            const pts = [];
            for (let i = 0; i <= 64; i++) {
              const angle = (i / 64) * Math.PI * 2;
              const x = Math.cos(angle) * baseRadius;
              const z = Math.sin(angle) * baseRadius;
              const tiltedY = Math.sin(inclination) * z;
              const tiltedZ = Math.cos(inclination) * z;
              pts.push(new THREE.Vector3(x, tiltedY, tiltedZ));
            }
            return pts;
          }, [baseRadius, inclination])}
          color={colorStr}
          opacity={0.15}
          transparent
          lineWidth={1}
          dashed={false}
        />
      )}
    </group>
  );
}

function CoreStar({ repoName }: { repoName: string }) {
  const coreRef = useRef<THREE.Mesh>(null);
  const ringsRef = useRef<THREE.Group>(null);
  
  useFrame(({ clock }) => {
    // Keep the core star spinning independently
    if (coreRef.current) {
      coreRef.current.scale.setScalar(1 + Math.sin(clock.getElapsedTime() * 2) * 0.03);
      coreRef.current.rotation.y += 0.005;
    }
    if (ringsRef.current) {
      ringsRef.current.rotation.z = clock.getElapsedTime() * -0.1;
      ringsRef.current.rotation.x = clock.getElapsedTime() * 0.05;
    }
  });

  return (
    <group>
      {/* Core Sphere */}
      {/* SCALE INCREASED: Core size */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[10.0, 32, 32]} />
        <meshPhysicalMaterial 
          color="#ffd700" 
          emissive="#ff8c00" 
          emissiveIntensity={2.5} 
          toneMapped={false} 
          roughness={0.4}
          metalness={0.1}
        />
        
        {/* Repo Name Label */}
        <Html center distanceFactor={30} zIndexRange={[100, 0]}>
          <div className="bg-black/60 px-5 py-3 rounded-full border border-primary/30 backdrop-blur-sm pointer-events-none transform -translate-y-20">
            <span className="text-white text-3xl font-black whitespace-nowrap shadow-black drop-shadow-lg" style={{ textShadow: `0 0 15px hsl(258, 90%, 66%)` }}>
              {repoName.length > 20 ? repoName.slice(0, 20) + "..." : repoName}
            </span>
          </div>
        </Html>
      </mesh>
      
      {/* Spinning Accretion Disks */}
      <group ref={ringsRef}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[10, 10.4, 32]} />
          <meshBasicMaterial color="hsl(258, 90%, 66%)" transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
        
        <mesh rotation={[Math.PI / 2.2, 0.1, 0]}>
          <ringGeometry args={[13, 13.2, 32]} />
          <meshBasicMaterial color="hsl(258, 90%, 80%)" transparent opacity={0.2} side={THREE.DoubleSide} />
        </mesh>
        
        <mesh rotation={[Math.PI / 1.8, -0.1, 0]}>
          <ringGeometry args={[16, 16.1, 32]} />
          <meshBasicMaterial color="white" transparent opacity={0.15} side={THREE.DoubleSide} />
        </mesh>
      </group>
      
      {/* Magical Sparkles around the core */}
      <Sparkles count={100} scale={25} size={3} speed={0.4} opacity={0.3} color="hsl(258, 90%, 80%)" />
    </group>
  );
}

// Intercepts resize and zoom to ensure the camera fits the whole large scene
function CameraSetup() {
  const { camera } = useThree();
  useEffect(() => {
    // Zoomed out camera to see the much larger orbital field
    camera.position.set(0, 30, 80);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  return null;
}

export function GravityVisualization({
  repoName,
  roles,
  agentStates,
  className = "",
  onAgentClick,
}: GravityVisualizationProps) {
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const isGlobalPaused = hoveredAgent !== null;

  return (
    <div className={`relative w-full h-full bg-black/40 overflow-hidden ${className}`} data-testid="gravity-visualization">
      {/* Background radial gradient to give it depth so it doesn't look completely flat black */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,0.8)_100%)] pointer-events-none z-10" />
      
      <Canvas dpr={[1, 1.5]} performance={{ min: 0.5 }}>
        <CameraSetup />
        <color attach="background" args={['#050510']} />
        
        {/* Lighting – ambient + directional three-point setup + Environment for PBR reflections */}
        <ambientLight intensity={1.0} />
        <directionalLight position={[50, 30, 50]} intensity={2.5} color="#ffffff" />
        <directionalLight position={[-30, -10, -40]} intensity={1.0} color="#8888ff" />
        <pointLight position={[0, 0, 0]} intensity={400} distance={200} color="hsl(258, 90%, 66%)" />
        <Environment preset="night" />
        
        {/* Environment */}
        <Stars radius={150} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />
        
        {/* Core and Planets wrapped in Suspense for useTexture */}
        <Suspense fallback={null}>
          <CoreStar repoName={repoName} />
          
          {roles.map((role, i) => {
            const agentState = agentStates?.find(s => s.agentName === role.name);
            return (
              <AgentPlanet 
                key={role.id} 
                role={role} 
                agentState={agentState}
                index={i} 
                totalRoles={roles.length} 
                isGlobalPaused={isGlobalPaused}
                setHoveredAgent={setHoveredAgent}
                onAgentClick={onAgentClick} 
              />
            );
          })}
        </Suspense>
        
        {/* Interaction */}
        <OrbitControls 
          enablePan={false}
          minDistance={30}
          maxDistance={200}
          autoRotate={!isGlobalPaused}
          autoRotateSpeed={0.5}
          maxPolarAngle={Math.PI / 1.5}
          minPolarAngle={Math.PI / 6}
          // The domElement trick below is sometimes needed if orbit controls eat all pointer events, but usually it works fine in Fiber
        />
        
        {/* Post-processing Glowing Bloom */}
        <EffectComposer>
          <Bloom luminanceThreshold={0.1} mipmapBlur intensity={2.0} />
        </EffectComposer>
      </Canvas>
      
      <div className="absolute top-2 right-4 text-xs text-muted-foreground pointer-events-none z-20">
        Drag to rotate • Scroll to zoom • Click nodes
      </div>
    </div>
  );
}

