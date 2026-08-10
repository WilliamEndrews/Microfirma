import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';

interface SceneProps {
  transitioning: boolean;
  onArrived: () => void;
  onStart: () => void;
}

const ROOM_W = 10;
const ROOM_D = 10;
const ROOM_H = 5;

export default function Scene({ transitioning, onArrived, onStart }: SceneProps) {
  return (
    <Canvas
      camera={{ position: [7, 13, 7], fov: 30 }}
      gl={{ antialias: true, alpha: false }}
      shadows
      onCreated={({ gl }) => {
        gl.setClearColor('#ffffff');
      }}
    >
      <Lighting />
      <Room />
      <Vultos count={7} />
      <CameraFlight transitioning={transitioning} onArrived={onArrived} />
      <ClickPlane onStart={onStart} />
    </Canvas>
  );
}

function Room() {
  const halfW = ROOM_W / 2;
  const halfD = ROOM_D / 2;
  const halfH = ROOM_H / 2;

  return (
    <group>
      {/* chao */}
      <Wall width={ROOM_W} height={ROOM_D} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} isFloor />
      {/* parede fundo */}
      <Wall width={ROOM_W} height={ROOM_H} position={[0, halfH, -halfD]} rotation={[0, 0, 0]} />
      {/* parede esquerda */}
      <Wall width={ROOM_D} height={ROOM_H} position={[-halfW, halfH, 0]} rotation={[0, Math.PI / 2, 0]} />
      {/* parede direita */}
      <Wall width={ROOM_D} height={ROOM_H} position={[halfW, halfH, 0]} rotation={[0, -Math.PI / 2, 0]} />
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

  return (
    <mesh geometry={geometry} position={position} rotation={rotation} receiveShadow castShadow={!isFloor}>
      <meshStandardMaterial
        color={isFloor ? '#e8e8e8' : '#f5f5f5'}
        roughness={1}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function Lighting() {
  const dirRef = useRef<THREE.DirectionalLight>(null);

  useEffect(() => {
    if (dirRef.current) {
      dirRef.current.shadow.mapSize.set(2048, 2048);
      dirRef.current.shadow.bias = -0.0002;
      dirRef.current.shadow.radius = 6;
    }
  }, []);

  return (
    <>
      <ambientLight intensity={0.8} color="#ffffff" />
      <hemisphereLight color="#ffffff" groundColor="#d0d0d0" intensity={0.5} />
      <directionalLight
        ref={dirRef}
        position={[3, 12, 4]}
        intensity={0.9}
        color="#ffffff"
        castShadow
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={0.1}
        shadow-camera-far={30}
      />
    </>
  );
}

interface VultoData {
  x: number;
  z: number;
  speed: number;
  phase: number;
  drift: number;
  scale: number;
}

function humanoidTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.clearRect(0, 0, 256, 512);

  // silhueta humanoide com gradiente suave
  const grad = ctx.createRadialGradient(128, 256, 20, 128, 256, 120);
  grad.addColorStop(0, 'rgba(10, 10, 10, 0.85)');
  grad.addColorStop(0.5, 'rgba(20, 20, 20, 0.5)');
  grad.addColorStop(1, 'rgba(20, 20, 20, 0)');

  ctx.filter = 'blur(14px)';
  ctx.fillStyle = grad;

  // cabeca
  ctx.beginPath();
  ctx.arc(128, 100, 42, 0, Math.PI * 2);
  ctx.fill();

  // ombros + tronco
  ctx.beginPath();
  ctx.moveTo(70, 170);
  ctx.quadraticCurveTo(128, 150, 186, 170);
  ctx.lineTo(180, 340);
  ctx.quadraticCurveTo(128, 360, 76, 340);
  ctx.closePath();
  ctx.fill();

  // pernas
  ctx.beginPath();
  ctx.moveTo(80, 340);
  ctx.quadraticCurveTo(95, 460, 90, 490);
  ctx.lineTo(110, 490);
  ctx.quadraticCurveTo(128, 400, 128, 360);
  ctx.quadraticCurveTo(128, 400, 146, 490);
  ctx.lineTo(166, 490);
  ctx.quadraticCurveTo(161, 460, 176, 340);
  ctx.closePath();
  ctx.fill();

  // sombra no chao
  ctx.filter = 'blur(24px)';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(128, 500, 60, 8, 0, 0, Math.PI * 2);
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
    return Array.from({ length: count }).map((_, i) => ({
      x: (Math.random() - 0.5) * (ROOM_W - 2),
      z: (Math.random() - 0.5) * (ROOM_D - 2),
      speed: 0.15 + Math.random() * 0.25,
      phase: (i / count) * Math.PI * 2,
      drift: (Math.random() - 0.5) * 1.5,
      scale: 0.7 + Math.random() * 0.4,
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
  const halfD = ROOM_D / 2;

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() * data.speed + data.phase;
    const cycle = ((t % 10) + 10) % 10;
    const progress = cycle / 10;

    ref.current.position.z = -halfD + 1 + progress * (ROOM_D - 2);
    ref.current.position.x = data.x + Math.sin(t * 0.3) * data.drift;
    ref.current.position.y = 0;
  });

  return (
    <Billboard ref={ref} follow lockX={false} lockY={false} lockZ={false}>
      <mesh scale={[data.scale, data.scale, data.scale]}>
        <planeGeometry args={[1.2, 2.4]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={0.55}
          alphaTest={0.01}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </Billboard>
  );
}

function CameraFlight({ transitioning, onArrived }: Pick<SceneProps, 'transitioning' | 'onArrived'>) {
  const { camera } = useThree();
  const startPos = useMemo(() => new THREE.Vector3(7, 13, 7), []);
  const endPos = useMemo(() => new THREE.Vector3(0, 1.8, 0.3), []);
  const progressRef = useRef(0);
  const [hasArrived, setHasArrived] = useState(false);

  useFrame((_, delta) => {
    if (hasArrived) return;

    camera.lookAt(0, 1, 0);

    if (!transitioning) return;

    progressRef.current += delta * 0.5;
    const p = Math.min(progressRef.current, 1);
    const eased = p * p * (3 - 2 * p);

    camera.position.lerpVectors(startPos, endPos, eased);

    const pc = camera as THREE.PerspectiveCamera;
    if (pc.fov !== undefined) {
      pc.fov = THREE.MathUtils.lerp(30, 55, eased);
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
    <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={onStart} visible={false}>
      <planeGeometry args={[ROOM_W, ROOM_D]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}
