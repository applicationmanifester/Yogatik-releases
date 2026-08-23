import { describe, it, expect } from 'vitest'
import {
  generateHero3D,
  generateCard3D,
  generateParticleField,
  threeuiTool,
  THREEUI_TEMPLATES,
} from './threeui'

describe('ThreeUI 3D Procedural Component Generator', () => {
  it('provides rich catalog templates for hero, cards, particles, and icons', () => {
    expect(THREEUI_TEMPLATES.hero.length).toBeGreaterThanOrEqual(4)
    expect(THREEUI_TEMPLATES.card.length).toBeGreaterThanOrEqual(3)
    expect(THREEUI_TEMPLATES.particles.length).toBeGreaterThanOrEqual(3)
  })

  it('generates production-ready Vanilla Three.js hero section', () => {
    const code = generateHero3D({
      type: 'particle_wave',
      framework: 'vanilla',
      title: 'Spatial Compute Platform',
      subtitle: 'Rendered in real-time WebGL',
      primaryColor: '#38bdf8',
      particleCount: 1500,
    })

    expect(code).toContain('<!DOCTYPE html>')
    expect(code).toContain('Spatial Compute Platform')
    expect(code).toContain('THREE.WebGLRenderer')
    expect(code).toContain('THREE.Points')
    expect(code).toContain('THREE.TorusKnotGeometry')
  })

  it('generates React Three Fiber (R3F) hero component with Drei controls', () => {
    const code = generateHero3D({
      framework: 'react',
      title: 'Cyberpunk Portal',
      primaryColor: '#a855f7',
    })

    expect(code).toContain("from '@react-three/fiber'")
    expect(code).toContain("from '@react-three/drei'")
    expect(code).toContain('<Canvas')
    expect(code).toContain('<MeshDistortMaterial')
    expect(code).toContain('<OrbitControls')
  })

  it('generates interactive 3D tilt card with specular glare physics', () => {
    const code = generateCard3D({
      title: 'Neural Engine 4.0',
      description: 'Ultra-low latency inference on edge GPUs',
      badge: 'NEW RELEASE',
      primaryColor: '#10b981',
    })

    expect(code).toContain('perspective(1000px)')
    expect(code).toContain('handleMouseMove')
    expect(code).toContain('handleMouseLeave')
    expect(code).toContain('backdropFilter')
    expect(code).toContain('Neural Engine 4.0')
  })

  it('generates custom GLSL vertex and fragment particle shader systems', () => {
    const code = generateParticleField({
      particleCount: 3000,
      color1: '#f43f5e',
      color2: '#3b82f6',
    })

    expect(code).toContain('THREE.ShaderMaterial')
    expect(code).toContain('vertexShader')
    expect(code).toContain('fragmentShader')
    expect(code).toContain('gl_PointSize')
    expect(code).toContain('gl_FragColor')
  })

  it('threeuiTool executes hero, card, particle, and template listing actions', async () => {
    const heroRes = await threeuiTool.execute({
      action: 'generate_hero',
      title: 'Autonomous AI',
      framework: 'react',
    })
    expect(heroRes.success).toBe(true)
    expect(heroRes.code).toContain('HeroSection')

    const cardRes = await threeuiTool.execute({
      action: 'generate_card',
      title: 'Quantum Key',
    })
    expect(cardRes.success).toBe(true)
    expect(cardRes.code).toContain('ThreeCard')

    const listRes = await threeuiTool.execute({ action: 'list_templates' })
    expect(listRes.success).toBe(true)
    expect(listRes.templates.hero).toBeDefined()
  })
})
