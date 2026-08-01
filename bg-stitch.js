/* Background "running stitch" — a thread-gold stitch sews itself down the page
   as you scroll, led by a needle, with occasional sashiko cross clusters.
   Architecture borrowed from web3d layered-separation pattern: fixed background
   render layer + scroll-scrubbed progress + on-demand rendering (no libraries). */
(function () {
  var canvas = document.getElementById('bg-stitch');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var path = [];      // stitch path points in document space
  var crosses = [];   // sashiko cross clusters [{x, y, docY}]
  var docH = 0, vw = 0, vh = 0, dpr = 1;

  // deterministic pseudo-random so the path is stable per layout
  function rng(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  function buildPath() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    docH = document.documentElement.scrollHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = vw * dpr;
    canvas.height = vh * dpr;
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';

    var rand = rng(2010); // est. 2010, of course
    path = [];
    crosses = [];
    var margin = Math.min(vw * 0.06, 80);
    var step = 140; // vertical distance between meander control rows
    var x = margin;
    for (var y = vh * 0.55; y < docH - vh * 0.25; y += step) {
      // meander: swing across the page with organic jitter
      var t = y / 900;
      var swing = (Math.sin(t) * 0.5 + 0.5); // 0..1
      var target = margin + swing * (vw - margin * 2);
      x = x + (target - x) * 0.6 + (rand() - 0.5) * vw * 0.08;
      x = Math.max(margin, Math.min(vw - margin, x));
      path.push({ x: x, y: y });
      if (rand() < 0.18) crosses.push({ x: x + (rand() - 0.5) * 60, y: y + step * 0.4 });
    }
    path = smooth(path, 10);
  }

  // Catmull-Rom resampling: turns the coarse control points into a dense,
  // organically curved polyline so the running stitch never looks angular
  function smooth(pts, seg) {
    if (pts.length < 3) return pts;
    var out = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i],
          p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (var j = 0; j < seg; j++) {
        var t = j / seg, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // total polyline length up to a given fraction of the page scrolled
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    if (path.length < 2) return;

    var scrollY = window.scrollY;
    // stitch is sewn down to just below the middle of the current viewport
    var sewnToY = reduced ? docH : scrollY + vh * 0.66;

    var thread = 'rgba(226, 161, 60, 0.16)';  // --bjs-thread, faint
    ctx.strokeStyle = thread;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.setLineDash([9, 8]); // running stitch

    ctx.beginPath();
    var tip = null;
    for (var i = 0; i < path.length - 1; i++) {
      var a = path[i], b = path[i + 1];
      if (a.y > sewnToY) break;
      var ax = a.x, ay = a.y - scrollY;
      var bx = b.x, by = b.y - scrollY;
      if (b.y <= sewnToY) {
        if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
        ctx.lineTo(bx, by);
        tip = { x: bx, y: by, px: ax, py: ay };
      } else {
        // partial segment up to the sewing point
        var f = (sewnToY - a.y) / (b.y - a.y);
        var mx = ax + (bx - ax) * f, my = ay + (by - ay) * f;
        if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
        ctx.lineTo(mx, my);
        tip = { x: mx, y: my, px: ax, py: ay };
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // sashiko cross clusters along the already-sewn part
    ctx.strokeStyle = 'rgba(159, 197, 232, 0.10)'; // faint indigo
    ctx.lineWidth = 2;
    for (var c = 0; c < crosses.length; c++) {
      var cr = crosses[c];
      if (cr.y > sewnToY) continue;
      var cy = cr.y - scrollY;
      if (cy < -20 || cy > vh + 20) continue;
      for (var k = -1; k <= 1; k++) {
        var cx = cr.x + k * 14;
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy - 5); ctx.lineTo(cx + 5, cy + 5);
        ctx.moveTo(cx + 5, cy - 5); ctx.lineTo(cx - 5, cy + 5);
        ctx.stroke();
      }
    }

    // the needle leading the stitch
    if (tip && !reduced && tip.y > -40 && tip.y < vh + 40) {
      var ang = Math.atan2(tip.y - tip.py, tip.x - tip.px);
      ctx.save();
      ctx.translate(tip.x, tip.y);
      ctx.rotate(ang);
      ctx.strokeStyle = 'rgba(200, 205, 212, 0.35)';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();          // shaft, pointing forward
      ctx.moveTo(0, 0); ctx.lineTo(26, 0);
      ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.beginPath();          // eye at the back
      ctx.ellipse(3.5, 0, 3.2, 1.8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // on-demand rendering: draw only on scroll / resize
  var ticking = false;
  function requestDraw() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(function () { draw(); ticking = false; });
    }
  }
  window.addEventListener('scroll', requestDraw, { passive: true });
  window.addEventListener('resize', function () { buildPath(); requestDraw(); });
  // images loading can change document height — rebuild once everything settles
  window.addEventListener('load', function () { buildPath(); requestDraw(); });

  buildPath();
  draw();
})();
