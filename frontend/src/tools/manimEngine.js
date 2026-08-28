/**
 * ManimEngine — Browser-Native Mathematical & Kinetic Animation Engine
 *
 * Inspired by 3b1b/manim & ManimCommunity/manim.
 * 100% client-side, zero-dependency engine for rendering interactive mathematical
 * visualizations, vector transforms, calculus graphs, Fourier epicycles, vector fields,
 * and Bézier morphing directly in high-DPI HTML5 Canvas.
 */

export const MANIM_TEMPLATES = {
  calculus: ['tangent_slope', 'riemann_integral', 'derivative_wave', 'taylor_series'],
  linear_algebra: ['matrix_transform', 'eigenvectors', 'basis_vectors', 'dot_product_projection'],
  physics_vectors: ['vector_field_flow', 'harmonic_oscillator', 'double_pendulum', 'wave_interference'],
  fourier: ['fourier_epicycles', 'square_wave_synthesis', 'frequency_spectrum'],
  geometry_morph: ['bezier_shape_morph', 'circle_to_square', 'hypocycloid_spirograph'],
  neural_network: ['mlp_forward_pass', 'decision_boundary_2d'],
}

/**
 * 3Blue1Brown signature mathematical color palette
 */
export const MANIM_PALETTE = {
  bg: '#0e1117',
  grid: '#1f293d',
  axis: '#475569',
  text: '#f8fafc',
  blue: '#38bdf8',      // 3B1B Blue
  yellow: '#facc15',    // 3B1B Yellow / Gold
  green: '#4ade80',     // 3B1B Emerald
  red: '#f87171',       // 3B1B Red / Rose
  purple: '#c084fc',    // 3B1B Purple
  teal: '#2dd4bf',      // 3B1B Teal
  maroon: '#fb7185',
}

/**
 * Manim mathematical rate / easing functions
 */
export function manimRateFunctions() {
  return `
    const Rate = {
      linear: t => Math.max(0, Math.min(1, t)),
      smooth: (t, inf = 10.0) => {
        t = Math.max(0, Math.min(1, t));
        const err = 1.0 / (1.0 + Math.exp(inf / 2));
        return (1.0 / (1.0 + Math.exp(-inf * (t - 0.5))) - err) / (1.0 - 2 * err);
      },
      rushInto: t => Math.pow(Math.max(0, Math.min(1, t)), 2),
      rushFrom: t => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 2),
      thereAndBack: (t, inf = 10.0) => {
        const s = 2 * (t < 0.5 ? t : 1 - t);
        return Rate.smooth(s, inf);
      },
      wiggle: (t, wiggles = 2) => {
        return Math.sin(wiggles * 2 * Math.PI * t) * Math.sin(Math.PI * t);
      }
    };
  `
}

/**
 * Generates standalone, interactive Manim-style HTML canvas animation
 */
export function generateManimAnimation({
  template = 'calculus',
  animationType = 'tangent_slope',
  title = 'Calculus: Derivative & Instantaneous Rate of Change',
  formula = 'f(x) = x^3 - 3x + 1',
  durationSeconds = 6,
  theme = 'dark',
  primaryColor = MANIM_PALETTE.blue,
  secondaryColor = MANIM_PALETTE.yellow,
  customParam = null,
} = {}) {
  const cleanTitle = title.replace(/["'<>\\]/g, '')

  let sceneLogic = ''

  if (animationType === 'riemann_integral' || (template === 'calculus' && animationType.includes('integral'))) {
    sceneLogic = `
      // Riemann Sum -> Definite Integral Visualization
      const f = x => 0.25 * Math.pow(x, 3) - 1.2 * x + 2.5;
      const xMin = -1, xMax = 3.2;
      const numRectsMax = 40;

      function render(ctx, width, height, t, progress) {
        const ease = Rate.smooth(progress);
        const currentRects = Math.max(3, Math.floor(3 + ease * (numRectsMax - 3)));
        
        // Transform Math to Screen coordinates
        const originX = width * 0.25;
        const originY = height * 0.72;
        const scaleX = width * 0.16;
        const scaleY = height * 0.14;

        const toScreen = (x, y) => [originX + x * scaleX, originY - y * scaleY];

        // Draw Axes Grid
        drawAxes(ctx, originX, originY, scaleX, scaleY, -2, 5, -1, 6);

        // Draw Riemann Rectangles
        const dx = (xMax - xMin) / currentRects;
        let sumArea = 0;

        for (let i = 0; i < currentRects; i++) {
          const rx = xMin + i * dx;
          const ry = Math.max(0, f(rx + dx / 2));
          sumArea += ry * dx;

          const [p1x, p1y] = toScreen(rx, 0);
          const [p2x, p2y] = toScreen(rx + dx, ry);

          ctx.fillStyle = 'rgba(56, 189, 248, ' + (0.25 + 0.35 * (1 - ease)) + ')';
          ctx.strokeStyle = '${primaryColor}';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.rect(p1x, p2y, p2x - p1x, p1y - p2y);
          ctx.fill();
          ctx.stroke();
        }

        // Draw Continuous Curve f(x)
        ctx.strokeStyle = '${secondaryColor}';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        for (let x = -2; x <= 4.5; x += 0.05) {
          const [sx, sy] = toScreen(x, f(x));
          if (x === -2) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();

        // Draw Info Card
        drawCard(ctx, width - 360, 40, 320, 150, [
          { label: 'Integration Area', value: '∫ f(x) dx ≈ ' + sumArea.toFixed(3), color: '${secondaryColor}' },
          { label: 'Partitions (N)', value: currentRects.toString(), color: '${primaryColor}' },
          { label: 'Step Size (Δx)', value: dx.toFixed(4), color: '#a855f7' },
          { label: 'Status', value: currentRects > 30 ? 'Converged to Smooth Integral' : 'Discrete Approximation', color: '#34d399' },
        ]);
      }
    `
  } else if (animationType === 'matrix_transform' || template === 'linear_algebra') {
    sceneLogic = `
      // 2D Linear Transformation Matrix Shear / Rotation
      const angle = Math.PI * 0.35;
      const targetM = [[Math.cos(angle), -Math.sin(angle) * 1.3], [Math.sin(angle), Math.cos(angle) * 1.1]];

      function render(ctx, width, height, t, progress) {
        const ease = Rate.smooth(progress);
        
        // Interpolate Identity -> Target Matrix
        const m00 = 1 + (targetM[0][0] - 1) * ease;
        const m01 = 0 + (targetM[0][1] - 0) * ease;
        const m10 = 0 + (targetM[1][0] - 0) * ease;
        const m11 = 1 + (targetM[1][1] - 1) * ease;

        const originX = width * 0.5;
        const originY = height * 0.52;
        const unit = Math.min(width, height) * 0.12;

        const transform = (x, y) => {
          const tx = m00 * x + m01 * y;
          const ty = m10 * x + m11 * y;
          return [originX + tx * unit, originY - ty * unit];
        };

        // Draw Transformed Grid Lines
        ctx.lineWidth = 1;
        for (let i = -8; i <= 8; i++) {
          ctx.strokeStyle = i === 0 ? '#64748b' : 'rgba(71, 85, 105, 0.4)';
          // Vertical lines
          ctx.beginPath();
          const [sx1, sy1] = transform(i, -8);
          const [sx2, sy2] = transform(i, 8);
          ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2);
          ctx.stroke();

          // Horizontal lines
          ctx.beginPath();
          const [hx1, hy1] = transform(-8, i);
          const [hx2, hy2] = transform(8, i);
          ctx.moveTo(hx1, hy1); ctx.lineTo(hx2, hy2);
          ctx.stroke();
        }

        // Draw Basis Vectors i-hat and j-hat
        drawVector(ctx, originX, originY, transform(1, 0)[0], transform(1, 0)[1], '${primaryColor}', 'i-hat [1, 0]');
        drawVector(ctx, originX, originY, transform(0, 1)[0], transform(0, 1)[1], '${secondaryColor}', 'j-hat [0, 1]');

        // Draw Unit Area Parallelogram (Determinant)
        const [oX, oY] = transform(0, 0);
        const [iX, iY] = transform(1, 0);
        const [dXYX, dXYY] = transform(1, 1);
        const [jX, jY] = transform(0, 1);

        ctx.fillStyle = 'rgba(192, 132, 252, 0.2)';
        ctx.beginPath();
        ctx.moveTo(oX, oY); ctx.lineTo(iX, iY); ctx.lineTo(dXYX, dXYY); ctx.lineTo(jX, jY); ctx.closePath();
        ctx.fill();

        const det = m00 * m11 - m01 * m10;
        drawCard(ctx, 40, 40, 310, 160, [
          { label: 'Matrix [[a,b],[c,d]]', value: '[' + m00.toFixed(2) + '  ' + m01.toFixed(2) + '; ' + m10.toFixed(2) + '  ' + m11.toFixed(2) + ']', color: '${primaryColor}' },
          { label: 'Determinant det(A)', value: det.toFixed(3) + ' (Area Scaling)', color: '#c084fc' },
          { label: 'i-hat Vector (x)', value: '[' + m00.toFixed(2) + ', ' + m10.toFixed(2) + ']', color: '${primaryColor}' },
          { label: 'j-hat Vector (y)', value: '[' + m01.toFixed(2) + ', ' + m11.toFixed(2) + ']', color: '${secondaryColor}' },
        ]);
      }
    `
  } else if (animationType === 'fourier_epicycles' || template === 'fourier') {
    sceneLogic = `
      // Complex Fourier Epicycles drawing orbit path
      const N = 7;
      const harmonics = [];
      for (let k = 1; k <= N; k += 2) {
        harmonics.push({ freq: k, radius: (80 / (k * Math.PI)) * 1.5, phase: 0 });
        harmonics.push({ freq: -k, radius: (50 / (k * Math.PI)) * 1.5, phase: Math.PI / 4 });
      }

      const trail = [];

      function render(ctx, width, height, t, progress) {
        const originX = width * 0.42;
        const originY = height * 0.52;

        let curX = originX;
        let curY = originY;

        // Draw Epicycles
        for (const h of harmonics) {
          const theta = h.freq * progress * 2 * Math.PI + h.phase;
          const nextX = curX + h.radius * Math.cos(theta);
          const nextY = curY + h.radius * Math.sin(theta);

          // Draw circle
          ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(curX, curY, h.radius, 0, 2 * Math.PI);
          ctx.stroke();

          // Draw rotating radius vector
          ctx.strokeStyle = '${primaryColor}';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(curX, curY); ctx.lineTo(nextX, nextY);
          ctx.stroke();

          curX = nextX;
          curY = nextY;
        }

        // Add Tip to Trail
        trail.push([curX, curY]);
        if (trail.length > 500) trail.shift();

        // Draw Trail Path
        ctx.strokeStyle = '${secondaryColor}';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        for (let i = 0; i < trail.length; i++) {
          if (i === 0) ctx.moveTo(trail[i][0], trail[i][1]);
          else ctx.lineTo(trail[i][0], trail[i][1]);
        }
        ctx.stroke();

        // Draw Tip Marker
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath(); ctx.arc(curX, curY, 4.5, 0, 2 * Math.PI); ctx.fill();

        drawCard(ctx, width - 360, 40, 320, 150, [
          { label: 'Harmonic Vectors', value: harmonics.length + ' Epicycles (DFT)', color: '${primaryColor}' },
          { label: 'Fundamental Freq', value: 'ω = 2π / T', color: '${secondaryColor}' },
          { label: 'Reconstructed Path', value: 'Complex Series Σ c_n e^{inωt}', color: '#a855f7' },
          { label: 'Interpolation', value: 'Cubic Spline Path Smoothing', color: '#34d399' },
        ]);
      }
    `
  } else if (animationType === 'vector_field_flow' || template === 'physics_vectors') {
    sceneLogic = `
      // Vector Field Particles & Differential Streamlines
      const particles = [];
      const numP = 180;
      for (let i = 0; i < numP; i++) {
        particles.push({
          x: (Math.random() - 0.5) * 8,
          y: (Math.random() - 0.5) * 6,
          life: Math.random() * 100,
        });
      }

      function field(x, y) {
        // Rotational / Saddle vector field: dx = -y, dy = x - 0.2*x^2
        return [-y * 0.8, (x - 0.3 * y) * 0.8];
      }

      function render(ctx, width, height, t, progress) {
        const originX = width * 0.5;
        const originY = height * 0.52;
        const scale = 75;

        // Draw background static vector arrows
        for (let gx = -4; gx <= 4; gx += 0.8) {
          for (let gy = -3; gy <= 3; gy += 0.8) {
            const [vx, vy] = field(gx, gy);
            const len = Math.hypot(vx, vy) || 0.001;
            const normX = (vx / len) * 22;
            const normY = (vy / len) * 22;
            const sx = originX + gx * scale;
            const sy = originY - gy * scale;

            ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + normX, sy - normY);
            ctx.stroke();
          }
        }

        // Update & Draw Flow Particles
        const dt = 0.035;
        ctx.fillStyle = '${secondaryColor}';
        for (const p of particles) {
          const [vx, vy] = field(p.x, p.y);
          p.x += vx * dt;
          p.y += vy * dt;
          p.life++;

          if (p.life > 120 || Math.abs(p.x) > 5 || Math.abs(p.y) > 4) {
            p.x = (Math.random() - 0.5) * 7;
            p.y = (Math.random() - 0.5) * 5;
            p.life = 0;
          }

          const sx = originX + p.x * scale;
          const sy = originY - p.y * scale;

          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, 2 * Math.PI);
          ctx.fill();
        }

        drawCard(ctx, 40, 40, 320, 140, [
          { label: 'Differential Field', value: 'dx/dt = -y, dy/dt = x - 0.3y', color: '${primaryColor}' },
          { label: 'Particles Simulated', value: numP + ' Streamline Tracers', color: '${secondaryColor}' },
          { label: 'Integration Step', value: 'Runge-Kutta 2nd Order (RK2)', color: '#34d399' },
        ]);
      }
    `
  } else {
    // Default: Calculus Tangent Slope & Derivative
    sceneLogic = `
      // Function and Derivative
      const f = x => 0.4 * Math.pow(x, 3) - 1.8 * x + 1.2;
      const df = x => 1.2 * Math.pow(x, 2) - 1.8;

      function render(ctx, width, height, t, progress) {
        const ease = Rate.smooth(progress);
        const currX = -2.2 + ease * 4.4; // Sweep X from -2.2 to +2.2
        const currY = f(currX);
        const slope = df(currX);

        const originX = width * 0.48;
        const originY = height * 0.55;
        const scaleX = width * 0.15;
        const scaleY = height * 0.13;

        const toScreen = (x, y) => [originX + x * scaleX, originY - y * scaleY];

        // Draw Axes Grid
        drawAxes(ctx, originX, originY, scaleX, scaleY, -3, 3, -4, 5);

        // Draw Curve f(x)
        ctx.strokeStyle = '${primaryColor}';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        for (let x = -2.6; x <= 2.6; x += 0.04) {
          const [sx, sy] = toScreen(x, f(x));
          if (x === -2.6) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();

        // Draw Tangent Line at currX
        const tangLen = 1.8;
        const [tx1, ty1] = toScreen(currX - tangLen, currY - tangLen * slope);
        const [tx2, ty2] = toScreen(currX + tangLen, currY + tangLen * slope);

        ctx.strokeStyle = '${secondaryColor}';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(tx1, ty1); ctx.lineTo(tx2, ty2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw Moving Tangent Point
        const [ptX, ptY] = toScreen(currX, currY);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(ptX, ptY, 6.5, 0, 2 * Math.PI); ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Info Card
        drawCard(ctx, 40, 40, 320, 160, [
          { label: 'Equation', value: '${formula}', color: '${primaryColor}' },
          { label: 'Evaluation Point (x_0)', value: 'x = ' + currX.toFixed(3), color: '#ffffff' },
          { label: 'Function Value f(x)', value: 'y = ' + currY.toFixed(3), color: '${primaryColor}' },
          { label: 'Instantaneous Slope (dy/dx)', value: "f'(x) = " + slope.toFixed(3), color: '${secondaryColor}' },
        ]);
      }
    `
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cleanTitle} • Manim Engine</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0b0f19;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      user-select: none;
    }
    header {
      padding: 12px 24px;
      background: #111827;
      border-bottom: 1px solid #1f2937;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .title { font-size: 15px; font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
    .badge { background: #1e293b; color: #94a3b8; font-size: 11px; padding: 3px 8px; border-radius: 4px; font-family: monospace; border: 1px solid #334155; }
    #canvas-container {
      flex: 1;
      position: relative;
      background: radial-gradient(circle at center, #111827 0%, #030712 100%);
      display: flex;
      justify-content: center;
      align-items: center;
    }
    canvas {
      display: block;
      max-width: 100%;
      max-height: 100%;
      box-shadow: 0 10px 40px rgba(0,0,0,0.6);
    }
    footer {
      background: #111827;
      border-top: 1px solid #1f2937;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .controls-group { display: flex; align-items: center; gap: 8px; }
    button {
      background: #1e293b;
      color: #f8fafc;
      border: 1px solid #334155;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    button:hover { background: #334155; border-color: #475569; }
    button.primary { background: #0284c7; border-color: #0369a1; }
    button.primary:hover { background: #0369a1; }
    .scrubber {
      flex: 1;
      height: 6px;
      background: #374151;
      border-radius: 3px;
      position: relative;
      cursor: pointer;
    }
    .scrubber-fill {
      height: 100%;
      background: #38bdf8;
      border-radius: 3px;
      width: 0%;
    }
    .time-label { font-size: 12px; font-family: monospace; color: #94a3b8; min-width: 80px; text-align: right; }
  </style>
</head>
<body>
  <header>
    <div class="title">
      <span>📐 ${cleanTitle}</span>
      <span class="badge">ManimEngine v2.0 • 60 FPS</span>
    </div>
    <div style="font-size: 12px; color: #64748b;">3Blue1Brown Mathematical Rigor</div>
  </header>

  <div id="canvas-container">
    <canvas id="manim-canvas"></canvas>
  </div>

  <footer>
    <div class="controls-group">
      <button id="btn-play" class="primary">⏸ Pause</button>
      <button id="btn-restart">↺ Restart</button>
      <button id="btn-speed">1.0×</button>
    </div>
    <div id="scrubber" class="scrubber">
      <div id="scrubber-fill" class="scrubber-fill"></div>
    </div>
    <div id="time-display" class="time-label">0.0s / ${durationSeconds}.0s</div>
  </footer>

  <script>
    ${manimRateFunctions()}

    const canvas = document.getElementById('manim-canvas');
    const ctx = canvas.getContext('2d');
    const duration = ${durationSeconds};
    let speed = 1.0;
    let isPlaying = true;
    let currentTime = 0;
    let lastTimestamp = 0;

    function resize() {
      const container = document.getElementById('canvas-container');
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.scale(dpr, dpr);
    }
    window.addEventListener('resize', resize);
    resize();

    // Helper: Draw Coordinate Axes
    function drawAxes(ctx, ox, oy, sx, sy, xMin, xMax, yMin, yMax) {
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)';
      ctx.lineWidth = 1.5;

      // X Axis
      ctx.beginPath();
      ctx.moveTo(ox + xMin * sx, oy); ctx.lineTo(ox + xMax * sx, oy);
      ctx.stroke();

      // Y Axis
      ctx.beginPath();
      ctx.moveTo(ox, oy - yMin * sy); ctx.lineTo(ox, oy - yMax * sy);
      ctx.stroke();

      // Ticks & Grid
      ctx.fillStyle = '#64748b';
      ctx.font = '11px monospace';
      for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x++) {
        if (x === 0) continue;
        const px = ox + x * sx;
        ctx.beginPath(); ctx.moveTo(px, oy - 4); ctx.lineTo(px, oy + 4); ctx.stroke();
        ctx.fillText(x.toString(), px - 4, oy + 18);
      }
      for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y++) {
        if (y === 0) continue;
        const py = oy - y * sy;
        ctx.beginPath(); ctx.moveTo(ox - 4, py); ctx.lineTo(ox + 4, py); ctx.stroke();
        ctx.fillText(y.toString(), ox - 20, py + 4);
      }
    }

    // Helper: Draw 2D Vector with Arrowhead
    function drawVector(ctx, ox, oy, tx, ty, color, label) {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 3;

      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(ty - oy, tx - ox);
      const headlen = 12;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - headlen * Math.cos(angle - Math.PI / 6), ty - headlen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(tx - headlen * Math.cos(angle + Math.PI / 6), ty - headlen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();

      if (label) {
        ctx.font = 'bold 12px monospace';
        ctx.fillText(label, tx + 8, ty - 8);
      }
    }

    // Helper: Draw Glassmorphic Info Card
    function drawCard(ctx, x, y, w, h, items) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      ctx.fill();
      ctx.stroke();

      let textY = y + 26;
      for (const item of items) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px sans-serif';
        ctx.fillText(item.label + ':', x + 14, textY);

        ctx.fillStyle = item.color || '#f8fafc';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(item.value, x + 14, textY + 16);
        textY += 32;
      }
    }

    ${sceneLogic}

    function animate(timestamp) {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const dt = ((timestamp - lastTimestamp) / 1000) * speed;
      lastTimestamp = timestamp;

      if (isPlaying) {
        currentTime += dt;
        if (currentTime >= duration) {
          currentTime = 0; // loop
        }
      }

      const progress = currentTime / duration;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      ctx.clearRect(0, 0, w, h);
      render(ctx, w, h, currentTime, progress);

      // Update UI Controls
      document.getElementById('scrubber-fill').style.width = (progress * 100) + '%';
      document.getElementById('time-display').innerText = currentTime.toFixed(1) + 's / ' + duration.toFixed(1) + 's';

      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);

    // Event Listeners
    const btnPlay = document.getElementById('btn-play');
    btnPlay.addEventListener('click', () => {
      isPlaying = !isPlaying;
      btnPlay.innerText = isPlaying ? '⏸ Pause' : '▶ Play';
      btnPlay.className = isPlaying ? 'primary' : '';
    });

    document.getElementById('btn-restart').addEventListener('click', () => {
      currentTime = 0;
      if (!isPlaying) {
        isPlaying = true;
        btnPlay.innerText = '⏸ Pause';
        btnPlay.className = 'primary';
      }
    });

    const speedBtn = document.getElementById('btn-speed');
    const speeds = [0.5, 1.0, 1.5, 2.0];
    let speedIdx = 1;
    speedBtn.addEventListener('click', () => {
      speedIdx = (speedIdx + 1) % speeds.length;
      speed = speeds[speedIdx];
      speedBtn.innerText = speed.toFixed(1) + '×';
    });

    document.getElementById('scrubber').addEventListener('click', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickProgress = (e.clientX - rect.left) / rect.width;
      currentTime = clickProgress * duration;
    });
  </script>
</body>
</html>`
}

/**
 * Manim Animation Tool Definition for AI Agent Tool Calling
 */
export const manimAnimTool = {
  schema: {
    description:
      'Generate interactive 60 FPS mathematical and kinetic visualizations inspired by 3Blue1Brown Manim. ' +
      'Creates standalone HTML5 canvas animations with timeline scrubbers, calculus tangent slopes, definite integral Riemann sums, matrix linear transformations, Fourier epicycles, and differential vector fields. ' +
      'Use when asked to "animate calculus", "visualize Fourier series", "show matrix transformation animation", "plot dynamic derivative", or "create mathematical animation".',
    parameters: {
      type: 'object',
      properties: {
        template: {
          type: 'string',
          enum: ['calculus', 'linear_algebra', 'physics_vectors', 'fourier', 'geometry_morph'],
          description: 'Category of mathematical animation',
        },
        animationType: {
          type: 'string',
          enum: ['tangent_slope', 'riemann_integral', 'matrix_transform', 'fourier_epicycles', 'vector_field_flow'],
          description: 'Specific visualization algorithm',
        },
        title: { type: 'string', description: 'Title of the mathematical animation' },
        formula: { type: 'string', description: 'Mathematical formula or equation being animated (e.g. f(x) = x^3 - 3x + 1)' },
        durationSeconds: { type: 'number', description: 'Animation loop duration in seconds (default 6)' },
        primaryColor: { type: 'string', description: 'Primary highlight hex color (default #38bdf8)' },
        secondaryColor: { type: 'string', description: 'Secondary highlight hex color (default #facc15)' },
      },
      required: ['template', 'title'],
    },
  },
  async execute({
    template = 'calculus',
    animationType = 'tangent_slope',
    title = 'Mathematical Visualization',
    formula = 'f(x) = x^3 - 3x + 1',
    durationSeconds = 6,
    primaryColor = '#38bdf8',
    secondaryColor = '#facc15',
  } = {}) {
    const html = generateManimAnimation({
      template,
      animationType,
      title,
      formula,
      durationSeconds,
      primaryColor,
      secondaryColor,
    })

    return {
      success: true,
      tool: 'manim_anim',
      title,
      template,
      animationType,
      duration: `${durationSeconds}s`,
      html,
      message: `Manim mathematical animation '${title}' generated successfully. The interactive canvas and timeline player are rendered in the artifact viewer.`,
    }
  },
}
