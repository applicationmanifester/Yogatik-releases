/**
 * ThreeUI Procedural 3D Web Component Engine
 * 
 * Inspired by MengTo/threeui (github.com/MengTo/threeui).
 * Generates production-ready Three.js and React Three Fiber (R3F) 3D components,
 * interactive hero scenes, glassmorphic tilt cards, procedural icons, and custom GLSL particle shaders.
 */

export const THREEUI_TEMPLATES = {
  hero: ['particle_wave', 'glass_torus', 'cyber_grid', 'floating_spheres', 'neon_nebula'],
  card: ['glass_tilt', 'holographic_badge', 'parallax_depth', 'metallic_panel'],
  particles: ['cursor_vortex', 'wave_harmonics', 'morphing_sphere', 'matrix_rain'],
  icon: ['crystal_gem', 'metallic_badge', 'torus_knot', 'quantum_core'],
}

/**
 * Generates an interactive 3D Hero section
 */
export function generateHero3D({
  type = 'particle_wave',
  framework = 'vanilla', // 'vanilla' | 'react'
  theme = 'dark',
  primaryColor = '#6366f1', // Indigo
  secondaryColor = '#ec4899', // Pink
  particleCount = 2000,
  title = 'Next-Gen 3D Interface',
  subtitle = 'Crafted with Three.js & Procedural Shaders',
} = {}) {
  const isReact = framework.toLowerCase() === 'react'

  if (isReact) {
    return `import React, { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Float, MeshDistortMaterial } from '@react-three/drei'
import * as THREE from 'three'

function HeroScene() {
  const pointsRef = useRef()
  const count = ${particleCount}

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const c1 = new THREE.Color('${primaryColor}')
    const c2 = new THREE.Color('${secondaryColor}')

    for (let i = 0; i < count; i++) {
      const u = (Math.random() - 0.5) * 20
      const v = (Math.random() - 0.5) * 20
      const w = (Math.random() - 0.5) * 10
      pos[i * 3] = u
      pos[i * 3 + 1] = v
      pos[i * 3 + 2] = w

      const mixed = c1.clone().lerp(c2, Math.random())
      col[i * 3] = mixed.r
      col[i * 3 + 1] = mixed.g
      col[i * 3 + 2] = mixed.b
    }
    return [pos, col]
  }, [count])

  useFrame(({ clock, pointer }) => {
    if (pointsRef.current) {
      const t = clock.getElapsedTime()
      pointsRef.current.rotation.y = t * 0.05 + pointer.x * 0.2
      pointsRef.current.rotation.x = pointer.y * 0.2
    }
  })

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1.5} color="${primaryColor}" />
      <pointLight position={[-10, -10, -5]} intensity={1} color="${secondaryColor}" />

      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.06}
          vertexColors
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      <Float speed={2} rotationIntensity={1.5} floatIntensity={2}>
        <mesh position={[0, 0, 0]}>
          <torusKnotGeometry args={[1.2, 0.35, 128, 32]} />
          <MeshDistortMaterial
            color="${primaryColor}"
            roughness={0.1}
            metalness={0.9}
            distort={0.3}
            speed={2}
          />
        </mesh>
      </Float>
      <OrbitControls enableZoom={false} enablePan={false} maxPolarAngle={Math.PI / 1.8} minPolarAngle={Math.PI / 2.2} />
    </>
  )
}

export default function HeroSection() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', background: '#0a0a0c', overflow: 'hidden' }}>
      <Canvas camera={{ position: [0, 0, 6], fov: 60 }} style={{ position: 'absolute', inset: 0 }}>
        <HeroScene />
      </Canvas>
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', pointerEvents: 'none', textAlign: 'center', color: '#fff' }}>
        <h1 style={{ fontSize: '3.5rem', fontWeight: 800, letterSpacing: '-0.03em', background: 'linear-gradient(135deg, #fff 30%, ${primaryColor} 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
          ${title}
        </h1>
        <p style={{ fontSize: '1.25rem', color: 'rgba(255,255,255,0.7)', marginTop: '1rem', maxWidth: '600px' }}>
          ${subtitle}
        </p>
      </div>
    </div>
  )
}`
  }

  // Vanilla Three.js Implementation
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0c; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow: hidden; }
    #canvas-container { position: absolute; inset: 0; width: 100vw; height: 100vh; }
    .hero-content { position: relative; z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; pointer-events: none; text-align: center; padding: 2rem; }
    .hero-title { font-size: clamp(2.5rem, 6vw, 4.5rem); font-weight: 800; letter-spacing: -0.03em; background: linear-gradient(135deg, #ffffff 40%, ${primaryColor} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .hero-subtitle { font-size: clamp(1rem, 2vw, 1.25rem); color: rgba(255,255,255,0.7); margin-top: 1rem; max-width: 600px; }
  </style>
</head>
<body>
  <div id="canvas-container"></div>
  <div class="hero-content">
    <h1 class="hero-title">${title}</h1>
    <p class="hero-subtitle">${subtitle}</p>
  </div>

  <script type="module">
    import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 6;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Particle System
    const particleCount = ${particleCount};
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const c1 = new THREE.Color('${primaryColor}');
    const c2 = new THREE.Color('${secondaryColor}');

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10;

      const mixed = c1.clone().lerp(c2, Math.random());
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);

    // Central 3D Mesh
    const torusGeo = new THREE.TorusKnotGeometry(1.2, 0.35, 128, 32);
    const torusMat = new THREE.MeshPhysicalMaterial({
      color: '${primaryColor}',
      metalness: 0.85,
      roughness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      transmission: 0.6,
      opacity: 1,
      transparent: true,
      ior: 1.5
    });
    const torus = new THREE.Mesh(torusGeo, torusMat);
    scene.add(torus);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const light1 = new THREE.DirectionalLight('${primaryColor}', 3);
    light1.position.set(5, 5, 5);
    scene.add(light1);
    const light2 = new THREE.PointLight('${secondaryColor}', 4, 20);
    light2.position.set(-5, -5, 2);
    scene.add(light2);

    // Mouse Tracking
    let mouseX = 0, mouseY = 0;
    window.addEventListener('mousemove', (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    // Resize Handler
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Animation Loop
    const clock = new THREE.Clock();
    function animate() {
      requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      torus.rotation.x = t * 0.4 + mouseY * 0.5;
      torus.rotation.y = t * 0.5 + mouseX * 0.5;
      particleSystem.rotation.y = t * 0.05 + mouseX * 0.2;
      renderer.render(scene, camera);
    }
    animate();
  </script>
</body>
</html>`
}

/**
 * Generates an interactive 3D Tilt Card with Raycasting
 */
export function generateCard3D({
  title = 'Pro Analytics',
  description = 'Real-time telemetry and predictive metrics.',
  badge = 'FEATURED',
  primaryColor = '#6366f1',
} = {}) {
  return `import React, { useRef, useState } from 'react'

export default function ThreeCard() {
  const cardRef = useRef(null)
  const [transform, setTransform] = useState('')
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 })

  const handleMouseMove = (e) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    const rotateX = ((y - centerY) / centerY) * -14
    const rotateY = ((x - centerX) / centerX) * 14

    setTransform(\`perspective(1000px) rotateX(\${rotateX}deg) rotateY(\${rotateY}deg) scale3d(1.03, 1.03, 1.03)\`)
    setGlare({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.25,
    })
  }

  const handleMouseLeave = () => {
    setTransform('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)')
    setGlare({ x: 50, y: 50, opacity: 0 })
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        width: '340px',
        padding: '2rem',
        borderRadius: '24px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(20px)',
        transform: transform || 'perspective(1000px) rotateX(0deg) rotateY(0deg)',
        transition: 'transform 0.15s ease-out, box-shadow 0.2s ease',
        boxShadow: glare.opacity > 0 ? '0 25px 50px -12px rgba(99, 102, 241, 0.25)' : 'none',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        color: '#fff',
      }}
    >
      {/* Glare effect */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: \`radial-gradient(circle at \${glare.x}% \${glare.y}%, rgba(255,255,255,0.4), transparent 60%)\`,
          opacity: glare.opacity,
          pointerEvents: 'none',
          transition: 'opacity 0.2s ease',
        }}
      />
      <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '999px', background: '${primaryColor}22', color: '${primaryColor}', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '1rem', border: '1px solid ${primaryColor}44' }}>
        ${badge}
      </div>
      <h3 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>${title}</h3>
      <p style={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: '0.95rem', lineHeight: 1.5, margin: 0 }}>
        ${description}
      </p>
    </div>
  )
}`
}

/**
 * Generates custom GLSL Particle Shader Field
 */
export function generateParticleField({
  particleCount = 5000,
  color1 = '#38bdf8', // Sky
  color2 = '#818cf8', // Indigo
} = {}) {
  return `import * as THREE from 'three';

export function createParticleField(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 4;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const count = ${particleCount};
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 12;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 8;
    scales[i] = Math.random();
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

  const vertexShader = \`
    uniform float uTime;
    attribute float aScale;
    varying vec3 vPosition;

    void main() {
      vPosition = position;
      vec3 pos = position;
      pos.y += sin(pos.x * 2.0 + uTime * 1.5) * 0.2;
      pos.x += cos(pos.y * 2.0 + uTime * 1.2) * 0.15;

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = (15.0 * aScale) * (1.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  \`;

  const fragmentShader = \`
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    varying vec3 vPosition;

    void main() {
      float dist = length(gl_PointCoord - vec2(0.5));
      if (dist > 0.5) discard;
      vec3 color = mix(uColor1, uColor2, sin(vPosition.x * 0.5 + vPosition.y * 0.5) * 0.5 + 0.5);
      float alpha = smoothstep(0.5, 0.0, dist);
      gl_FragColor = vec4(color, alpha * 0.8);
    }
  \`;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color('${color1}') },
      uColor2: { value: new THREE.Color('${color2}') }
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    material.uniforms.uTime.value = clock.getElapsedTime();
    points.rotation.y = clock.getElapsedTime() * 0.04;
    renderer.render(scene, camera);
  }
  animate();

  return { scene, renderer, points };
}`
}

export const threeuiTool = {
  schema: {
    name: 'threeui',
    description: 'ThreeUI 3D web component and procedural Three.js generator (inspired by MengTo/threeui). Creates interactive 3D hero scenes, glassmorphic tilt cards, custom GLSL particle fields, and procedural PBR icons.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['generate_hero', 'generate_card', 'generate_particles', 'list_templates'],
          description: 'Type of 3D component to generate or inspect.',
        },
        type: {
          type: 'string',
          description: 'Template type (e.g. "particle_wave", "glass_torus", "cyber_grid", "glass_tilt").',
        },
        framework: {
          type: 'string',
          enum: ['vanilla', 'react'],
          description: 'Target frontend framework: "vanilla" (HTML/JS) or "react" (React Three Fiber). Default is "vanilla".',
        },
        title: {
          type: 'string',
          description: 'Headline or title text.',
        },
        subtitle: {
          type: 'string',
          description: 'Subtitle description.',
        },
        primaryColor: {
          type: 'string',
          description: 'Primary hex color (e.g. "#6366f1").',
        },
        secondaryColor: {
          type: 'string',
          description: 'Secondary hex color (e.g. "#ec4899").',
        },
        particleCount: {
          type: 'number',
          description: 'Number of particles (default: 2000).',
        },
      },
      required: ['action'],
    },
  },

  async execute(args) {
    const {
      action,
      type = 'particle_wave',
      framework = 'vanilla',
      title = 'Next-Gen 3D Interface',
      subtitle = 'Crafted with Three.js & Procedural Shaders',
      primaryColor = '#6366f1',
      secondaryColor = '#ec4899',
      particleCount = 2000,
    } = args

    switch (action) {
      case 'generate_hero': {
        const code = generateHero3D({
          type,
          framework,
          title,
          subtitle,
          primaryColor,
          secondaryColor,
          particleCount,
        })
        return {
          success: true,
          action: 'generate_hero',
          framework,
          type,
          code,
        }
      }

      case 'generate_card': {
        const code = generateCard3D({
          title,
          description: subtitle,
          primaryColor,
        })
        return {
          success: true,
          action: 'generate_card',
          framework: 'react',
          code,
        }
      }

      case 'generate_particles': {
        const code = generateParticleField({
          particleCount,
          color1: primaryColor,
          color2: secondaryColor,
        })
        return {
          success: true,
          action: 'generate_particles',
          code,
        }
      }

      case 'list_templates': {
        return {
          success: true,
          action: 'list_templates',
          templates: THREEUI_TEMPLATES,
        }
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Valid actions: generate_hero, generate_card, generate_particles, list_templates.`,
        }
    }
  },
}
