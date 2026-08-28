import { describe, it, expect } from 'vitest'
import {
  MANIM_TEMPLATES,
  MANIM_PALETTE,
  generateManimAnimation,
  manimAnimTool,
} from './manimEngine'

describe('ManimEngine Mathematical Animation Generator', () => {
  it('exposes all template categories and palette colors', () => {
    expect(MANIM_TEMPLATES.calculus).toContain('tangent_slope')
    expect(MANIM_TEMPLATES.linear_algebra).toContain('matrix_transform')
    expect(MANIM_TEMPLATES.fourier).toContain('fourier_epicycles')
    expect(MANIM_TEMPLATES.physics_vectors).toContain('vector_field_flow')

    expect(MANIM_PALETTE.blue).toBe('#38bdf8')
    expect(MANIM_PALETTE.yellow).toBe('#facc15')
  })

  it('generates standalone interactive HTML for calculus animation', () => {
    const html = generateManimAnimation({
      template: 'calculus',
      animationType: 'tangent_slope',
      title: 'Derivative Slope Demo',
      formula: 'f(x) = x^3 - 3x',
      durationSeconds: 5,
    })

    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Derivative Slope Demo')
    expect(html).toContain('manim-canvas')
    expect(html).toContain('Rate.smooth')
    expect(html).toContain('btn-play')
    expect(html).toContain('scrubber')
  })

  it('generates interactive linear algebra matrix transformation scene', () => {
    const html = generateManimAnimation({
      template: 'linear_algebra',
      animationType: 'matrix_transform',
      title: 'Matrix Shear and Rotation',
    })

    expect(html).toContain('Matrix Shear and Rotation')
    expect(html).toContain('i-hat')
    expect(html).toContain('j-hat')
    expect(html).toContain('Determinant')
  })

  it('generates Fourier epicycles visualization', () => {
    const html = generateManimAnimation({
      template: 'fourier',
      animationType: 'fourier_epicycles',
      title: 'Fourier Epicycle Orbit',
    })

    expect(html).toContain('Fourier Epicycle Orbit')
    expect(html).toContain('harmonics')
    expect(html).toContain('trail')
  })

  it('generates vector field particle simulation', () => {
    const html = generateManimAnimation({
      template: 'physics_vectors',
      animationType: 'vector_field_flow',
      title: 'Rotational Saddle Flow',
    })

    expect(html).toContain('Rotational Saddle Flow')
    expect(html).toContain('particles')
    expect(html).toContain('field(p.x, p.y)')
  })

  it('executes manimAnimTool and returns structured result', async () => {
    const result = await manimAnimTool.execute({
      template: 'calculus',
      animationType: 'riemann_integral',
      title: 'Definite Integral & Riemann Sum',
      durationSeconds: 8,
    })

    expect(result.success).toBe(true)
    expect(result.tool).toBe('manim_anim')
    expect(result.title).toBe('Definite Integral & Riemann Sum')
    expect(result.html).toContain('Definite Integral & Riemann Sum')
    expect(result.html).toContain('sumArea')
  })
})
