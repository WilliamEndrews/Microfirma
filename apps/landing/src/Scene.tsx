import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface SceneProps {
  transitioning: boolean;
  onArrived: () => void;
  onStart: () => void;
}

export default function Scene({ transitioning, onArrived, onStart }: SceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 1.6, 9], fov: 55 }}
      gl={{ antialias: true, alpha: false }}
      shadows
      onCreated={({ gl }) => {
        gl.setClearColor('#ffffff');
      }}
    >
      <Lighting />
      <Room />
      <Vultos count={8} />
      <CameraFlight transitioning={transitioning} onArrived={onArrived} />
      <ClickPlane onStart={onStart} />
    </Canvas>
  );
}

function Room() {
  return (
    <group>
      <Wall width={12} height={4.5} position={[0, 2.25, -6]} rotation={[0, 0, 0]} />
      <Wall width={12} height={4.5} position={[-4, 2.25, 0]} rotation={[0, Math.PI / 2, 0]} />
      <Wall width={12} height={4.5} position={[4, 2.25, 0]} rotation={[0, -Math.PI / 2, 0]} />
      <Wall width={8} height={12} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} isFloor />
      <Wall width={8} height={12} position={[0, 4.5, 0]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

interface WallProps {
  width: number;
  height: number;
  position: [number, number, number];
  rotation: [number, number, number];
  isFloor?: boolean;
}

function Wall({ width, height, position, rotation, isFloor }: WallProps) {
  const geometry = useMemo(() => new THREE.PlaneGeometry(width, height), [width, height]);
  const color = isFloor ? '#f2f2f2' : '#ffffff';

  return (
    <mesh geometry={geometry} position={position} rotation={rotation} receiveShadow castShadow={!isFloor}>
      <meshStandardMaterial color={color} roughness={0.9} metalness={0.05} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Lighting() {
  const dirRef = useRef<THREE.DirectionalLight>(null);

  useEffect(() => {
    if (dirRef.current) {
      dirRef.current.shadow.mapSize.set(2048, 2048);
      dirRef.current.shadow.bias = -0.0005;
      dirRef.current.shadow.radius = 4;
    }
  }, []);

  return (
    <>
      <ambientLight intensity={0.7} color="#ffffff" />
      <directionalLight
        ref={dirRef}
        position={[2, 5, 6]}
        intensity={1.4}
        color="#ffffff"
        castShadow
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={0.1}
        shadow-camera-far={20}
      />
      <pointLight position={[0, 3.5, 2]} intensity={0.4} color="#ffffff" />
    </>
  );
}

interface VultosProps {
  count: number;
}

function Vultos({ count }: VultosProps) {
  const groupRef = useRef<THREE.Group>(null);
  const vultos = useMemo(() => {
    return Array.from({ length: count }).map(() => ({
      x: (Math.random() - 0.5) * 5,
      y: 0.8 + Math.random() * 2.2,
      speed: 0.4 + Math.random() * 0.7,
      phase: Math.random() * 12,
      drift: (Math.random() - 0.5) * 1.5,
      scale: 0.7 + Math.random() * 0.6,
    }));
  }, [count]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.children.forEach((child, i) => {
      const v = vultos[i]!;
      const t = clock.getElapsedTime() * v.speed + v.phase;
      child.position.z = -6 + ((t % 12 + 12) % 12);
      child.position.x = v.x + Math.sin(t * 0.5) * v.drift;
      child.position.y = v.y + Math.sin(t * 0.8) * 0.05;
      child.rotation.y = t * 0.3;
    });
  });

  return (
    <group ref={groupRef}>
      {vultos.map((_, i) => (
        <mesh key={i} position={[0, 0, 0]} scale={[_.scale, _.scale * 2.2, _.scale]} castShadow>
          <capsuleGeometry args={[0.2, 1.1, 4, 12]} />
          <meshStandardMaterial color="#111111" transparent opacity={0.22} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function CameraFlight({ transitioning, onArrived }: Pick<SceneProps, 'transitioning' | 'onArrived'>) {
  const { camera } = useThree();
  const startZ = 9;
  const endZ = 0.25;
  const startY = 1.6;
  const endY = 1.6;
  const progressRef = useRef(0);
  const [hasArrived, setHasArrived] = useState(false);

  useFrame((_, delta) => {
    if (!transitioning || hasArrived) return;

    const pc = camera as THREE.PerspectiveCamera;
    if (pc.fov === undefined) return;

    progressRef.current += delta * 0.65;
    const p = Math.min(progressRef.current, 1);
    const eased = p * p * (3 - 2 * p);

    pc.position.z = THREE.MathUtils.lerp(startZ, endZ, eased);
    pc.position.y = THREE.MathUtils.lerp(startY, endY, eased);
    pc.fov = THREE.MathUtils.lerp(60, 90, eased);
    pc.updateProjectionMatrix();

    if (p >= 1 && !hasArrived) {
      setHasArrived(true);
      onArrived();
    }
  });

  return null;
}

function ClickPlane({ onStart }: Pick<SceneProps, 'onStart'>) {
  return (
    <mesh position={[0, 2.25, 5.9]} onClick={onStart} visible={false}>
      <planeGeometry args={[8, 4.5]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}
