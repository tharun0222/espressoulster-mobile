// Model coordinates are centered on the mug. Each surface is a ring mesh.
export const dinerDuration = 2200;

export function animateDiner(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const faces = [];
  const steps = 48;
  const tau = Math.PI * 2;

  function surface(point, rows, color) {
    for (let row = 0; row < rows; row++) {
      for (let i = 0; i < steps; i++) {
        faces.push({
          vertices: [point(row, i), point(row, i + 1), point(row + 1, i + 1), point(row + 1, i)],
          color,
        });
      }
    }
  }

  const profile = [[0, -1], [.67, -1], [.74, -.91], [.82, .77],
    [.81, .83], [.73, .83], [.71, .66], [.67, .46]];
  surface((row, i) => {
    const [radius, y] = profile[row];
    const angle = i * tau / steps;
    return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
  }, profile.length - 1, [67, 43, 34]);

  surface((row, i) => {
    const angle = i * tau / steps;
    return [row * .68 * Math.cos(angle), .5, row * .68 * Math.sin(angle)];
  }, 1, [118, 63, 33]);

  surface((row, i) => {
    const angle = Math.PI * (row / 24 - .5);
    const tube = i * tau / steps;
    const radial = .57 + .105 * Math.cos(tube);
    return [.71 + radial * Math.cos(angle), .04 + radial * Math.sin(angle), .105 * Math.sin(tube)];
  }, 24, [67, 43, 34]);

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = performance.now();

  function draw(now) {
    if (!canvas.isConnected) return;
    const progress = reduceMotion ? 1 : Math.min((now - start) / dinerDuration, 1);
    const angle = tau * (progress * progress * (3 - 2 * progress));
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    function view([x, y, z]) {
      const depth = z * c - x * s;
      return [x * c + z * s, y * .96 - depth * .28, y * .28 + depth * .96];
    }

    function screen([x, y, z]) {
      const scale = 94 / (1 - z * .12);
      return [124 + x * scale, 140 - y * scale];
    }

    const scene = faces.map(({ vertices, color }) => {
      const points = vertices.map(view);
      return { points, color, depth: points.reduce((sum, point) => sum + point[2], 0) / 4 };
    });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const { points, color } of scene.sort((a, b) => a.depth - b.depth)) {
      const [a, b, d] = points;
      const u = b.map((value, i) => value - a[i]);
      const v = d.map((value, i) => value - a[i]);
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const light = .9 + .55 * Math.abs((-.65 * normal[0] + .5 * normal[1] + .4 * normal[2]) / (Math.hypot(...normal) || 1));
      ctx.fillStyle = ctx.strokeStyle = 'rgb(' + color.map(channel => Math.round(channel * light)).join(',') + ')';
      ctx.beginPath();
      for (const point of points) ctx.lineTo(...screen(point));
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    }

    if (c > .2) {
      const [x, y] = screen(view([0, -.12, .79]));
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(c, 1);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff5e5';
      ctx.font = 'bold 11px system-ui';
      ctx.fillText('ESPRESSOULSTER', 0, 0);
      ctx.fillStyle = '#ffab87';
      ctx.font = '9px system-ui';
      ctx.fillText('COFFEE', 0, 14);
      ctx.restore();
    }

    if (progress < 1) requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
}
