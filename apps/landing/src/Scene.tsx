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
      camera={{ position: [0, 1.2, 8], fov: 60 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor('#ffffff');
      }}
    >
      <ambientLight intensity={0.85} color="#ffffff" />
      <directionalLight position={[4, 8, 4]} intensity={1.2} color="#ffffff" />
      <pointLight position={[0, 2.5, 0]} intensity={0.6} color="#ffffff" />

      <Room />
      <Atmosphere count={7} />
      <CameraFlight transitioning={transitioning} onArrived={onArrived} />
      <ClickPlane onStart={onStart} />
    </Canvas>
  );
}

function Room() {
  const geometry = useMemo(() => new THREE.BoxGeometry(8, 4.5, 12), []);

  return (
    <mesh geometry={geometry} scale={[-1, 1, 1]}>
      <meshStandardMaterial color="#fafafa" side={THREE.BackSide} roughness={0.5} metalness={0.05} />
    </mesh>
  );
}

interface AtmosphereProps {
  count: number;
}

function Atmosphere({ count }: AtmosphereProps) {
  const groupRef = useRef<THREE.Group>(null);
  const silhouettes = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => ({
      position: [
        (Math.random() - 0.5) * 6,
        0.5 + Math.random() * 2.5,
        -4 - Math.random() * 6,
      ] as [number, number, number],
      scale: 0.6 + Math.random() * 0.9,
      speed: 0.08 + Math.random() * 0.1,
      phase: Math.random() * Math.PI * 2,
    }));
  }, [count]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.children.forEach((child, i) => {
      child.position.y += Math.sin(clock.getElapsedTime() * silhouettes[i]!.speed + silhouettes[i]!.phase) * 0.001;
      child.rotation.y += 0.002;
    });
  });

  return (
    <group ref={groupRef}>
      {silhouettes.map((s, i) => (
        <mesh key={i} position={s.position} scale={[s.scale, s.scale * 1.6, s.scale]}>
          <sphereGeometry args={[0.35, 16, 16]} />
          <meshBasicMaterial color="#1a1a1a" transparent opacity={0.12} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function CameraFlight({ transitioning, onArrived }: Pick<SceneProps, 'transitioning' | 'onArrived'>) {
  const { camera } = useThree();
  const startZ = 8;
  const endZ = 0.25;
  const startY = 1.2;
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
