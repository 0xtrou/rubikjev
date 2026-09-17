"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import RubiksCube, { type CubeApi } from "./RubiksCube";

export default function CubeStage({
  cubeRef,
  resetKey,
}: {
  cubeRef: React.Ref<CubeApi>;
  resetKey: number;
}) {
  return (
    <Canvas
      camera={{ position: [4.6, 4.2, 5.4], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 8, 5]} intensity={1.4} />
      <directionalLight position={[-6, -4, -6]} intensity={0.35} />
      <group rotation={[0.12, -0.55, 0]}>
        <RubiksCube ref={cubeRef} resetKey={resetKey} />
      </group>
      <ContactShadows position={[0, -2.6, 0]} opacity={0.45} scale={12} blur={2.6} far={4} />
      <OrbitControls
        enablePan={false}
        minDistance={5}
        maxDistance={11}
        rotateSpeed={0.9}
        dampingFactor={0.12}
      />
    </Canvas>
  );
}
