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
      orthographic
      camera={{ position: [10, 10, 10], zoom: 55, near: -50, far: 100 }}
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

function whiteTexture(baseColor: string, noiseAmount: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const a = Math.random() * noiseAmount;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(x, y, 1, 1);
  }

  const grad = ctx.createRadialGradient(256, 256, 120, 256, 256, 380);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${noiseAmount * 0.6})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

function Room() {
  const halfW = ROOM_W / 2;
  const halfD = ROOM_D / 2;
  const halfH = ROOM_H / 2;

  const floorTex = useMemo(() => whiteTexture('#e2e2e2', 0.04), []);
  const wallTex = useMemo(() => whiteTexture('#f5f5f5', 0.025), []);

  return (
    <group>
      <Wall width={ROOM_W} height={ROOM_D} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} isFloor texture={floorTex} />
      <Wall width={ROOM_W} height={ROOM_H} position={[0, halfH, -halfD]} rotation={[0, 0, 0]} texture={wallTex} />
      <Wall width={ROOM_D} height={ROOM_H} position={[-halfW, halfH, 0]} rotation={[0, Math.PI / 2, 0]} texture={wallTex} />
      <Wall width={ROOM_D} height={ROOM_H} position={[halfW, halfH, 0]} rotation={[0, -Math.PI / 2, 0]} texture={wallTex} />
    </group>
  );
}

interface WallProps {
  width: number;
  height: number;
  position: [number, number, number];
  rotation: [number, number, number];
  isFloor?: boolean;
  texture: THREE.CanvasTexture;
}

function Wall({ width, height, position, rotation, isFloor, texture }: WallProps) {
  const geometry = useMemo(() => new THREE.PlaneGeometry(width, height), [width, height]);

  return (
    <mesh geometry={geometry} position={position} rotation={rotation} receiveShadow castShadow={!isFloor}>
      <meshStandardMaterial
        map={texture}
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
      dirRef.current.shadow.radius = 8;
    }
  }, []);

  return (
    <>
      <ambientLight intensity={0.75} color="#ffffff" />
      <hemisphereLight color="#ffffff" groundColor="#cccccc" intensity={0.45} />
      <directionalLight
        ref={dirRef}
        position={[5, 14, 5]}
        intensity={1.1}
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

  const bodyGrad = ctx.createLinearGradient(0, 0, 0, 512);
  bodyGrad.addColorStop(0, 'rgba(18, 18, 18, 0.75)');
  bodyGrad.addColorStop(0.4, 'rgba(15, 15, 15, 0.7)');
  bodyGrad.addColorStop(1, 'rgba(10, 10, 10, 0.55)');

  ctx.filter = 'blur(5px)';
  ctx.fillStyle = bodyGrad;

  // cabeca
  ctx.beginPath();
  ctx.arc(128, 65, 30, 0, Math.PI * 2);
  ctx.fill();

  // pescoco
  ctx.fillRect(118, 88, 20, 18);

  // ombros + tronco
  ctx.beginPath();
  ctx.moveTo(74, 120);
  ctx.quadraticCurveTo(128, 102, 182, 120);
  ctx.lineTo(174, 270);
  ctx.quadraticCurveTo(128, 290, 82, 270);
  ctx.closePath();
  ctx.fill();

  // braco esquerdo
  ctx.beginPath();
  ctx.moveTo(74, 125);
  ctx.quadraticCurveTo(60, 190, 64, 260);
  ctx.lineTo(80, 260);
  ctx.quadraticCurveTo(84, 190, 90, 130);
  ctx.closePath();
  ctx.fill();

  // braco direito
  ctx.beginPath();
  ctx.moveTo(182, 125);
  ctx.quadraticCurveTo(196, 190, 192, 260);
  ctx.lineTo(176, 260);
  ctx.quadraticCurveTo(172, 190, 166, 130);
  ctx.closePath();
  ctx.fill();

  // perna esquerda
  ctx.beginPath();
  ctx.moveTo(82, 270);
  ctx.quadraticCurveTo(88, 370, 92, 460);
  ctx.lineTo(120, 460);
  ctx.quadraticCurveTo(128, 370, 124, 280);
  ctx.closePath();
  ctx.fill();

  // perna direita
  ctx.beginPath();
  ctx.moveTo(174, 270);
  ctx.quadraticCurveTo(168, 370, 164, 460);
  ctx.lineTo(136, 460);
  ctx.quadraticCurveTo(128, 370, 132, 280);
  ctx.closePath();
  ctx.fill();

  // sombra no chao
  ctx.filter = 'blur(18px)';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(128, 495, 48, 7, 0, 0, Math.PI * 2);
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
    const cycle = ((t % 12) + 12) % 12;
    const progress = cycle / 12;

    ref.current.position.z = -halfD + 1 + progress * (ROOM_D - 2);
    ref.current.position.x = data.x + Math.sin(t * 0.35) * data.drift;
    ref.current.position.y = 0;

    const mesh = ref.current.children[0] as THREE.Mesh | undefined;
    if (mesh) {
      const sway = Math.sin(t * 2.5) * 0.04;
      mesh.rotation.z = sway;
    }
  });

  return (
    <Billboard ref={ref} follow lockX={false} lockY={false} lockZ={false}>
      <mesh scale={[data.scale, data.scale, data.scale]}>
        <planeGeometry args={[1.1, 2.2]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={0.7}
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
  const startPos = useMemo(() => new THREE.Vector3(10, 10, 10), []);
  const endPos = useMemo(() => new THREE.Vector3(2.5, 2.5, 3.5), []);
  const startZoom = 55;
  const endZoom = 110;
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

    const oc = camera as THREE.OrthographicCamera;
    oc.zoom = THREE.MathUtils.lerp(startZoom, endZoom, eased);
    oc.updateProjectionMatrix();

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
