import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';

interface SceneProps {
  transitioning: boolean;
  onArrived: () => void;
  onStart: () => void;
}

export default function Scene({ transitioning, onArrived, onStart }: SceneProps) {
  return (
    <Canvas
      camera={{ position: [8, 10, 8], fov: 32 }}
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
      dirRef.current.shadow.bias = -0.0001;
      dirRef.current.shadow.radius = 4;
    }
  }, []);

  return (
    <>
      <ambientLight intensity={0.65} color="#ffffff" />
      <hemisphereLight color="#ffffff" groundColor="#b0b0b0" intensity={0.4} />
      <directionalLight
        ref={dirRef}
        position={[4, 9, 6]}
        intensity={1.3}
        color="#ffffff"
        castShadow
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={0.1}
        shadow-camera-far={25}
      />
      <pointLight position={[-2, 3, 2]} intensity={0.25} color="#e0e0e0" />
    </>
  );
}

interface VultoData {
  x: number;
  speed: number;
  phase: number;
  drift: number;
  scale: number;
}

function humanoidTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.filter = 'blur(8px)';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';

  // corpo alongado
  ctx.beginPath();
  ctx.ellipse(64, 150, 34, 78, 0, 0, Math.PI * 2);
  ctx.fill();

  // cabeca
  ctx.beginPath();
  ctx.arc(64, 54, 26, 0, Math.PI * 2);
  ctx.fill();

  // sombra inferior para suavizar
  ctx.filter = 'blur(16px)';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(64, 245, 40, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface VultosProps {
  count: number;
}

function Vultos({ count }: VultosProps) {
  const texture = useMemo(humanoidTexture, []);
  const vultos = useMemo<VultoData[]>(() => {
    return Array.from({ length: count }).map(() => ({
      x: (Math.random() - 0.5) * 6,
      speed: 0.3 + Math.random() * 0.4,
      phase: Math.random() * 20,
      drift: (Math.random() - 0.5) * 2,
      scale: 0.8 + Math.random() * 0.5,
    }));
  }, [count]);

  return (
    <group>
      {vultos.map((data, i) => (
        <Vulto key={i} data={data} texture={texture} />
      ))}
    </group>
  );
}

function Vulto({ data, texture }: { data: VultoData; texture: THREE.CanvasTexture }) {
  const ref = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() * data.speed + data.phase;
    ref.current.position.z = -6 + ((t % 12 + 12) % 12);
    ref.current.position.x = data.x + Math.sin(t * 0.4) * data.drift;
    ref.current.position.y = 0.05;
  });

  return (
    <Billboard ref={ref} follow lockX={false} lockY={false} lockZ={false}>
      <mesh scale={[data.scale, data.scale, data.scale]} castShadow>
        <planeGeometry args={[0.9, 1.8]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={0.45}
          alphaTest={0.02}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </Billboard>
  );
}

function CameraFlight({ transitioning, onArrived }: Pick<SceneProps, 'transitioning' | 'onArrived'>) {
  const { camera } = useThree();
  const startPos = useMemo(() => new THREE.Vector3(8, 10, 8), []);
  const endPos = useMemo(() => new THREE.Vector3(0.5, 1.5, 0.5), []);
  const progressRef = useRef(0);
  const [hasArrived, setHasArrived] = useState(false);

  useFrame((_, delta) => {
    if (hasArrived) return;

    camera.lookAt(0, 0, 0);

    if (!transitioning) return;

    progressRef.current += delta * 0.55;
    const p = Math.min(progressRef.current, 1);
    const eased = p * p * (3 - 2 * p);

    camera.position.lerpVectors(startPos, endPos, eased);

    const pc = camera as THREE.PerspectiveCamera;
    if (pc.fov !== undefined) {
      pc.fov = THREE.MathUtils.lerp(32, 50, eased);
      pc.updateProjectionMatrix();
    }

    if (p >= 1 && !hasArrived) {
      setHasArrived(true);
      onArrived();
    }
  });

  return null;
}

function ClickPlane({ onStart }: Pick<SceneProps, 'onStart'>) {
  return (
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={onStart} visible={false}>
      <planeGeometry args={[12, 12]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}
