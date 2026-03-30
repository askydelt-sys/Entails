"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// Per-level difficulty config
function getLevelConfig(level: number) {
  return {
    squirrelCount: 20 + level * 8,
    gravityRadius: Math.max(100, 180 - level * 12),
    squirrelSpeed: 0.6 + level * 0.25,
    fleeRadius: level >= 2 ? Math.max(0, 60 + level * 15) : 0,
    fleeForce: level >= 2 ? 0.18 + level * 0.06 : 0,
    diskHue: [36, 180, 280, 0, 120][Math.min(level - 1, 4)],
  };
}

const TAIL_SEGMENTS = 6;
const TAIL_SEGMENT_LENGTH = 7;
const ENTANGLE_DIST = 18;
const ENTANGLE_THRESHOLD = 25;

interface Squirrel {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  scale: number;
  tail: { x: number; y: number; px: number; py: number }[];
  entangled: boolean;
}

interface EntanglementLink {
  s1: number;
  s2: number;
  t1: number;
  t2: number;
  restLength: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkleSpeed: number;
  twinkleOffset: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

type Phase = "playing" | "collapsing" | "blackhole" | "transition";

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

export default function BlackHoleGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    squirrels: [] as Squirrel[],
    stars: [] as Star[],
    particles: [] as Particle[],
    pointer: null as { x: number; y: number } | null,
    pointerActive: false,
    phase: "playing" as Phase,
    blackHoleRadius: 0,
    blackHoleAge: 0,
    hawkingParticles: [] as Particle[],
    accretionAngle: 0,
    vortexPulse: 0,
    transitionAlpha: 0,
    level: 1,
    entanglementLinks: [] as EntanglementLink[],
    entangledGroups: new Map<number, number[]>(),
    collapseProgress: 0,
    collapseCenterX: 0,
    collapseCenterY: 0,
    emissionTimer: 0,
  });
  const rafRef = useRef<number>(0);
  const [phase, setPhase] = useState<Phase>("playing");
  const [level, setLevel] = useState(1);
  const [entangledCount, setEntangledCount] = useState(0);

  const spawnSquirrels = useCallback(
    (w: number, h: number, lvl: number, existing?: Squirrel[]) => {
      const cfg = getLevelConfig(lvl);
      const squirrels: Squirrel[] = existing ? [...existing] : [];
      const startId =
        squirrels.length > 0
          ? Math.max(...squirrels.map((s) => s.id)) + 1
          : 0;
      const count = existing ? 0 : cfg.squirrelCount;
      for (let i = 0; i < count; i++) {
        const x = randomBetween(40, w - 40);
        const y = randomBetween(40, h - 40);
        const angle = Math.random() * Math.PI * 2;
        const tail: Squirrel["tail"] = [];
        for (let j = 0; j < TAIL_SEGMENTS; j++) {
          tail.push({
            x: x - Math.cos(angle) * TAIL_SEGMENT_LENGTH * (j + 1),
            y: y - Math.sin(angle) * TAIL_SEGMENT_LENGTH * (j + 1),
            px: x - Math.cos(angle) * TAIL_SEGMENT_LENGTH * (j + 1),
            py: y - Math.sin(angle) * TAIL_SEGMENT_LENGTH * (j + 1),
          });
        }
        squirrels.push({
          id: startId + i,
          x,
          y,
          vx: randomBetween(-cfg.squirrelSpeed, cfg.squirrelSpeed),
          vy: randomBetween(-cfg.squirrelSpeed, cfg.squirrelSpeed),
          angle,
          speed: randomBetween(cfg.squirrelSpeed * 0.7, cfg.squirrelSpeed * 1.4),
          scale: 1,
          tail,
          entangled: false,
        });
      }
      stateRef.current.squirrels = squirrels;
      stateRef.current.entanglementLinks = [];
      stateRef.current.entangledGroups = new Map();
    },
    []
  );

  const spawnStars = useCallback((w: number, h: number) => {
    const stars: Star[] = [];
    for (let i = 0; i < 120; i++) {
      stars.push({
        x: randomBetween(0, w),
        y: randomBetween(0, h),
        size: randomBetween(0.5, 2.5),
        opacity: randomBetween(0.3, 1),
        twinkleSpeed: randomBetween(0.5, 2),
        twinkleOffset: Math.random() * Math.PI * 2,
      });
    }
    stateRef.current.stars = stars;
  }, []);

  const spawnAbsorbParticles = (x: number, y: number) => {
    const colors = ["#a855f7", "#7c3aed", "#ec4899", "#f59e0b"];
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randomBetween(1, 4);
      stateRef.current.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      spawnStars(canvas.width, canvas.height);
      if (stateRef.current.squirrels.length === 0) {
        spawnSquirrels(canvas.width, canvas.height, stateRef.current.level);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const getPos = (e: MouseEvent | Touch): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const pos =
        "touches" in e ? getPos(e.touches[0]) : getPos(e as MouseEvent);
      stateRef.current.pointer = pos;
      stateRef.current.pointerActive = true;
    };
    const onMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!stateRef.current.pointerActive) return;
      const pos =
        "touches" in e ? getPos(e.touches[0]) : getPos(e as MouseEvent);
      stateRef.current.pointer = pos;
    };
    const onUp = () => {
      stateRef.current.pointerActive = false;
      stateRef.current.pointer = null;
    };

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onUp);
    canvas.addEventListener("touchstart", onDown, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onUp);

    // ── TAIL PHYSICS ──────────────────────────────────────────────
    function updateTailPhysics(sq: Squirrel, dt: number) {
      const segs = sq.tail;
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        const vx = (seg.x - seg.px) * 0.96;
        const vy = (seg.y - seg.py) * 0.96;
        seg.px = seg.x;
        seg.py = seg.y;
        seg.x += vx;
        seg.y += vy;
        seg.y += 0.08 * dt;
      }

      // Connect first segment to body
      const first = segs[0];
      const dx0 = first.x - sq.x;
      const dy0 = first.y - sq.y;
      const d0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
      if (d0 > TAIL_SEGMENT_LENGTH) {
        const f = (d0 - TAIL_SEGMENT_LENGTH) / d0;
        first.x -= dx0 * f;
        first.y -= dy0 * f;
      }

      // Chain constraints
      for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < segs.length - 1; i++) {
          const a = segs[i];
          const b = segs[i + 1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 0.001) {
            const f = (d - TAIL_SEGMENT_LENGTH) / d * 0.5;
            a.x += dx * f;
            a.y += dy * f;
            b.x -= dx * f;
            b.y -= dy * f;
          }
        }
      }

      // Boundary clamp for tail segments
      for (const seg of segs) {
        seg.x = Math.max(5, Math.min(canvas!.width - 5, seg.x));
        seg.y = Math.max(5, Math.min(canvas!.height - 5, seg.y));
      }
    }

    // ── ENTANGLEMENT CONSTRAINTS ──────────────────────────────────
    function applyEntanglementConstraints(links: EntanglementLink[], squirrels: Squirrel[]) {
      for (const link of links) {
        const s1 = squirrels.find((s) => s.id === link.s1);
        const s2 = squirrels.find((s) => s.id === link.s2);
        if (!s1 || !s2) continue;
        const a = s1.tail[link.t1];
        const b = s2.tail[link.t2];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0.001 && d > link.restLength) {
          const f = (d - link.restLength) / d * 0.15;
          a.x += dx * f;
          a.y += dy * f;
          b.x -= dx * f;
          b.y -= dy * f;
        }
      }
    }

    // ── ENTANGLEMENT DETECTION (UNION-FIND) ───────────────────────
    function getEntangledGroups(): Map<number, number[]> {
      const squirrels = stateRef.current.squirrels.filter(
        (sq) => !sq.entangled
      );
      const parent: Record<number, number> = {};
      for (const sq of squirrels) parent[sq.id] = sq.id;

      function find(x: number): number {
        while (parent[x] !== x) {
          parent[x] = parent[parent[x]];
          x = parent[x];
        }
        return x;
      }
      function union(a: number, b: number) {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent[ra] = rb;
      }

      // Check existing links
      for (const link of stateRef.current.entanglementLinks) {
        if (parent[link.s1] !== undefined && parent[link.s2] !== undefined) {
          union(link.s1, link.s2);
        }
      }

      // Check for new entanglements
      const links = stateRef.current.entanglementLinks;
      for (let i = 0; i < squirrels.length; i++) {
        for (let j = i + 1; j < squirrels.length; j++) {
          const s1 = squirrels[i];
          const s2 = squirrels[j];
          if (find(s1.id) === find(s2.id)) continue;
          let found = false;
          for (let t1 = 0; t1 < s1.tail.length && !found; t1++) {
            for (let t2 = 0; t2 < s2.tail.length && !found; t2++) {
              const dx = s1.tail[t1].x - s2.tail[t2].x;
              const dy = s1.tail[t1].y - s2.tail[t2].y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < ENTANGLE_DIST) {
                links.push({
                  s1: s1.id,
                  s2: s2.id,
                  t1,
                  t2,
                  restLength: dist,
                });
                s1.entangled = true;
                s2.entangled = true;
                union(s1.id, s2.id);
                found = true;
              }
            }
          }
        }
      }

      // Build groups
      const groups = new Map<number, number[]>();
      for (const sq of squirrels) {
        const r = find(sq.id);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r)!.push(sq.id);
      }
      return groups;
    }

    let lastTime = 0;

    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 16, 3);
      lastTime = time;
      const t = time / 1000;
      const s = stateRef.current;
      const w = canvas!.width;
      const h = canvas!.height;
      const cx = w / 2;
      const cy = h / 2;
      const cfg = getLevelConfig(s.level);

      // ── COLLAPSING PHASE ──────────────────────────────────────
      if (s.phase === "collapsing") {
        s.collapseProgress += 0.012 * dt;

        // Compute center of mass from original-ish positions
        const entangledSq = s.squirrels.filter((sq) => sq.entangled);
        let tcx = 0,
          tcy = 0;
        for (const sq of entangledSq) {
          tcx += sq.x;
          tcy += sq.y;
        }
        tcx /= entangledSq.length;
        tcy /= entangledSq.length;
        s.collapseCenterX = tcx;
        s.collapseCenterY = tcy;

        // Spiral each entangled squirrel toward center
        for (const sq of entangledSq) {
          const dx = sq.x - tcx;
          const dy = sq.y - tcy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) + 0.15 * dt;
          const newDist = dist * (1 - 0.04 * dt);
          sq.x = tcx + Math.cos(angle) * newDist;
          sq.y = tcy + Math.sin(angle) * newDist;
          sq.scale = Math.max(0.05, 1 - s.collapseProgress * 0.95);
          for (const seg of sq.tail) {
            const sdx = seg.x - tcx;
            const sdy = seg.y - tcy;
            const sa = Math.atan2(sdy, sdx) + 0.15 * dt;
            const sd = Math.sqrt(sdx * sdx + sdy * sdy) * (1 - 0.04 * dt);
            seg.x = tcx + Math.cos(sa) * sd;
            seg.y = tcy + Math.sin(sa) * sd;
            seg.px = seg.x;
            seg.py = seg.y;
          }

          // Collapse particles
          if (Math.random() < 0.4) {
            const pa = Math.random() * Math.PI * 2;
            s.particles.push({
              x: sq.x + randomBetween(-10, 10),
              y: sq.y + randomBetween(-10, 10),
              vx: Math.cos(pa) * randomBetween(0.5, 2),
              vy: Math.sin(pa) * randomBetween(0.5, 2),
              life: 1,
              maxLife: 1,
              color: ["#a855f7", "#ec4899", "#f59e0b", "#7c3aed"][
                Math.floor(Math.random() * 4)
              ],
            });
          }
        }

        // Complete collapse → black hole
        if (s.collapseProgress >= 1) {
          s.phase = "blackhole";
          setPhase("blackhole");
          s.blackHoleRadius = 15;
          s.blackHoleAge = 0;
          s.emissionTimer = 0;
          // Remove entangled squirrels, keep free ones
          s.squirrels = s.squirrels.filter((sq) => !sq.entangled);
          s.entanglementLinks = [];
          s.entangledGroups = new Map();
          s.collapseProgress = 0;
          setEntangledCount(0);
          // Burst of particles at black hole center
          for (let i = 0; i < 40; i++) {
            const pa = Math.random() * Math.PI * 2;
            const ps = randomBetween(1, 5);
            s.particles.push({
              x: s.collapseCenterX,
              y: s.collapseCenterY,
              vx: Math.cos(pa) * ps,
              vy: Math.sin(pa) * ps,
              life: 1,
              maxLife: 1,
              color: ["#a855f7", "#7c3aed", "#ec4899"][
                Math.floor(Math.random() * 3)
              ],
            });
          }
        }

        // Render frame
        ctx.fillStyle = "#050508";
        ctx.fillRect(0, 0, w, h);
        renderStars(ctx, s, t);
        renderParticles(ctx, s, dt);
        renderSquirrels(ctx, s);
        renderEntanglementLinks(ctx, s);

        // Collapse glow
        const glowIntensity = s.collapseProgress;
        const collapseGlow = ctx.createRadialGradient(
          tcx,
          tcy,
          0,
          tcx,
          tcy,
          100 * glowIntensity
        );
        collapseGlow.addColorStop(
          0,
          `rgba(168,85,247,${0.4 * glowIntensity})`
        );
        collapseGlow.addColorStop(
          0.5,
          `rgba(236,72,153,${0.2 * glowIntensity})`
        );
        collapseGlow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = collapseGlow;
        ctx.beginPath();
        ctx.arc(tcx, tcy, 100 * glowIntensity, 0, Math.PI * 2);
        ctx.fill();

        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // ── TRANSITION FADE ──────────────────────────────────────
      if (s.phase === "transition") {
        s.transitionAlpha = Math.min(1, s.transitionAlpha + 0.025 * dt);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = s.transitionAlpha;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        if (s.transitionAlpha >= 1) {
          s.blackHoleRadius = 0;
          s.blackHoleAge = 0;
          s.transitionAlpha = 0;
          s.particles = [];
          s.hawkingParticles = [];
          s.entanglementLinks = [];
          s.entangledGroups = new Map();
          s.collapseProgress = 0;
          s.emissionTimer = 0;
          s.phase = "playing";
          setPhase("playing");
          setEntangledCount(0);
          setLevel(s.level);
          spawnSquirrels(w, h, s.level);
          spawnStars(w, h);
        }
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      ctx.fillStyle = "#050508";
      ctx.fillRect(0, 0, w, h);

      // ── STARS ────────────────────────────────────────────────
      renderStars(ctx, s, t);

      // ── PLAYING PHYSICS ──────────────────────────────────────
      if (s.phase === "playing") {
        // Gravity well visual + physics (no absorption)
        if (s.pointerActive && s.pointer) {
          s.vortexPulse += 0.08 * dt;
          const pulse = 1 + 0.12 * Math.sin(s.vortexPulse);
          const grd = ctx.createRadialGradient(
            s.pointer.x,
            s.pointer.y,
            0,
            s.pointer.x,
            s.pointer.y,
            cfg.gravityRadius * pulse
          );
          grd.addColorStop(0, "rgba(168,85,247,0.35)");
          grd.addColorStop(0.4, "rgba(124,58,237,0.15)");
          grd.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(
            s.pointer.x,
            s.pointer.y,
            cfg.gravityRadius * pulse,
            0,
            Math.PI * 2
          );
          ctx.fill();

          ctx.strokeStyle = `rgba(168,85,247,${0.3 + 0.2 * Math.sin(s.vortexPulse)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(s.pointer.x, s.pointer.y, 40, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Squirrel body physics
        for (const sq of s.squirrels) {
          if (s.pointerActive && s.pointer) {
            const dx = s.pointer.x - sq.x;
            const dy = s.pointer.y - sq.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Flee mechanic (level 2+)
            if (cfg.fleeRadius > 0 && dist < cfg.fleeRadius) {
              const flee =
                (1 - dist / cfg.fleeRadius) * cfg.fleeForce;
              sq.vx -= (dx / dist) * flee * dt;
              sq.vy -= (dy / dist) * flee * dt;
            } else if (dist < cfg.gravityRadius && dist > 1) {
              // Gravity well attraction (no absorption)
              const force = (1 - dist / cfg.gravityRadius) * 0.5;
              sq.vx += (dx / dist) * force * dt;
              sq.vy += (dy / dist) * force * dt;
            }
          }

          // Wander
          sq.angle += randomBetween(-0.08, 0.08) * dt;
          sq.vx += Math.cos(sq.angle) * 0.03 * dt;
          sq.vy += Math.sin(sq.angle) * 0.03 * dt;

          const spd = Math.sqrt(sq.vx * sq.vx + sq.vy * sq.vy);
          if (spd > sq.speed * 2.5) {
            sq.vx = (sq.vx / spd) * sq.speed * 2.5;
            sq.vy = (sq.vy / spd) * sq.speed * 2.5;
          }

          sq.x += sq.vx * dt;
          sq.y += sq.vy * dt;

          if (sq.x < 20) {
            sq.x = 20;
            sq.vx = Math.abs(sq.vx);
          }
          if (sq.x > w - 20) {
            sq.x = w - 20;
            sq.vx = -Math.abs(sq.vx);
          }
          if (sq.y < 20) {
            sq.y = 20;
            sq.vy = Math.abs(sq.vy);
          }
          if (sq.y > h - 20) {
            sq.y = h - 20;
            sq.vy = -Math.abs(sq.vy);
          }

          // Tail physics
          updateTailPhysics(sq, dt);
        }

        // Entanglement constraints between linked tails
        applyEntanglementConstraints(s.entanglementLinks, s.squirrels);

        // Soft drag: entangled tails pull their squirrels toward each other
        for (const link of s.entanglementLinks) {
          const s1 = s.squirrels.find((sq) => sq.id === link.s1);
          const s2 = s.squirrels.find((sq) => sq.id === link.s2);
          if (!s1 || !s2) continue;
          const dx = s2.x - s1.x;
          const dy = s2.y - s1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 60 && dist > 0) {
            const f = Math.min(0.015, (dist - 60) * 0.0004);
            s1.vx += (dx / dist) * f * dt;
            s1.vy += (dy / dist) * f * dt;
            s2.vx -= (dx / dist) * f * dt;
            s2.vy -= (dy / dist) * f * dt;
          }
        }

        // Detect entanglements
        const groups = getEntangledGroups();
        s.entangledGroups = groups;
        let maxGroupSize = 0;
        for (const [, members] of groups) {
          if (members.length > maxGroupSize) maxGroupSize = members.length;
        }
        setEntangledCount(maxGroupSize);

        // Check collapse threshold
        if (maxGroupSize >= ENTANGLE_THRESHOLD && s.phase === "playing") {
          s.phase = "collapsing";
          setPhase("collapsing");
          s.collapseProgress = 0;
          // Compute initial collapse center
          const entangledSq = s.squirrels.filter((sq) => sq.entangled);
          let tcx = 0,
            tcy = 0;
          for (const sq of entangledSq) {
            tcx += sq.x;
            tcy += sq.y;
          }
          s.collapseCenterX = tcx / entangledSq.length;
          s.collapseCenterY = tcy / entangledSq.length;
        }

        // Render squirrels + tails
        renderSquirrels(ctx, s);
        renderEntanglementLinks(ctx, s);
      }

      // ── PARTICLES ────────────────────────────────────────────
      renderParticles(ctx, s, dt);

      // ── BLACK HOLE ───────────────────────────────────────────
      if (s.phase === "blackhole") {
        s.blackHoleRadius += 0.4 * dt;
        s.blackHoleRadius = Math.min(s.blackHoleRadius, 120);
        s.blackHoleAge += dt;
        s.accretionAngle += 0.02 * dt;

        const bhr = s.blackHoleRadius;

        // Emit squirrel pairs periodically
        s.emissionTimer += dt;
        if (s.emissionTimer > 200) {
          s.emissionTimer = 0;
          if (s.squirrels.length < 60) {
            const emitAngle = Math.random() * Math.PI * 2;
            const emitR = bhr + 8;
            const ex = cx + Math.cos(emitAngle) * emitR;
            const ey = cy + Math.sin(emitAngle) * emitR;
            const speed = cfg.squirrelSpeed * 1.8;

            // Squirrel 1: goes outward
            const tail1: Squirrel["tail"] = [];
            for (let j = 0; j < TAIL_SEGMENTS; j++) {
              tail1.push({
                x: ex - Math.cos(emitAngle) * TAIL_SEGMENT_LENGTH * (j + 1),
                y: ey - Math.sin(emitAngle) * TAIL_SEGMENT_LENGTH * (j + 1),
                px: ex - Math.cos(emitAngle) * TAIL_SEGMENT_LENGTH * (j + 1),
                py: ey - Math.sin(emitAngle) * TAIL_SEGMENT_LENGTH * (j + 1),
              });
            }
            const newId1 =
              s.squirrels.length > 0
                ? Math.max(...s.squirrels.map((sq) => sq.id)) + 1
                : 0;
            s.squirrels.push({
              id: newId1,
              x: ex,
              y: ey,
              vx: Math.cos(emitAngle) * speed,
              vy: Math.sin(emitAngle) * speed,
              angle: emitAngle,
              speed: cfg.squirrelSpeed,
              scale: 1,
              tail: tail1,
              entangled: false,
            });

            // Squirrel 2: goes opposite (toward black hole center)
            const tail2: Squirrel["tail"] = [];
            for (let j = 0; j < TAIL_SEGMENTS; j++) {
              tail2.push({
                x:
                  ex +
                  Math.cos(emitAngle) * TAIL_SEGMENT_LENGTH * (j + 1),
                y:
                  ey +
                  Math.sin(emitAngle) * TAIL_SEGMENT_LENGTH * (j + 1),
                px:
                  ex +
                  Math.cos(emitAngle) * TAIL_SEGMENT_LENGTH * (j + 1),
                py:
                  ey +
                  Math.sin(emitAngle) * TAIL_SEGMENT_LENGTH * (j + 1),
              });
            }
            s.squirrels.push({
              id: newId1 + 1,
              x: ex,
              y: ey,
              vx: -Math.cos(emitAngle) * speed * 0.5,
              vy: -Math.sin(emitAngle) * speed * 0.5,
              angle: emitAngle + Math.PI,
              speed: cfg.squirrelSpeed,
              scale: 1,
              tail: tail2,
              entangled: false,
            });
          }
        }

        // Update emitted/free squirrels
        for (const sq of s.squirrels) {
          // Attraction to black hole
          const dx = cx - sq.x;
          const dy = cy - sq.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 1) {
            const force = 3000 / (dist * dist + 100);
            sq.vx += (dx / dist) * force * dt;
            sq.vy += (dy / dist) * force * dt;
          }
          sq.x += sq.vx * dt;
          sq.y += sq.vy * dt;

          // Update tail
          updateTailPhysics(sq, dt);

          // Absorb if inside event horizon
          if (dist < bhr + 5) {
            sq.entangled = true; // mark for removal
            sq.scale = 0;
            spawnAbsorbParticles(sq.x, sq.y);
          }
        }
        // Remove absorbed squirrels
        s.squirrels = s.squirrels.filter((sq) => !sq.entangled);

        // Hawking radiation
        if (Math.random() < 0.3) {
          const angle = Math.random() * Math.PI * 2;
          const r = bhr + randomBetween(2, 8);
          s.hawkingParticles.push({
            x: cx + Math.cos(angle) * r,
            y: cy + Math.sin(angle) * r,
            vx: Math.cos(angle) * randomBetween(0.5, 2),
            vy: Math.sin(angle) * randomBetween(0.5, 2),
            life: 1,
            maxLife: 1,
            color: `hsl(${cfg.diskHue + Math.random() * 60}, 100%, 70%)`,
          });
        }

        s.hawkingParticles = s.hawkingParticles.filter((p) => p.life > 0);
        for (const p of s.hawkingParticles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= 0.018 * dt;
          ctx.globalAlpha = Math.max(0, p.life * 0.8);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Outer glow
        const outerGlow = ctx.createRadialGradient(
          cx,
          cy,
          bhr * 0.5,
          cx,
          cy,
          bhr * 3.5
        );
        outerGlow.addColorStop(0, "rgba(88,28,135,0.5)");
        outerGlow.addColorStop(0.4, "rgba(59,7,100,0.25)");
        outerGlow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, bhr * 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Accretion disk
        const h1 = cfg.diskHue;
        const diskOpacities = [0.28, 0.18, 0.12];
        for (let ring = 0; ring < 3; ring++) {
          const rx = bhr * (1.8 + ring * 0.6);
          const ry = bhr * (0.35 + ring * 0.1);
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(s.accretionAngle + ring * 0.4);
          ctx.beginPath();
          ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${h1 + ring * 15},90%,60%,${diskOpacities[ring]})`;
          ctx.lineWidth = 3 - ring;
          ctx.stroke();
          ctx.restore();
        }

        // Photon ring
        const photonGrd = ctx.createRadialGradient(
          cx,
          cy,
          bhr * 1.0,
          cx,
          cy,
          bhr * 1.35
        );
        photonGrd.addColorStop(0, `hsla(${h1},100%,75%,0)`);
        photonGrd.addColorStop(0.5, `hsla(${h1},100%,75%,0.55)`);
        photonGrd.addColorStop(1, `hsla(${h1},100%,75%,0)`);
        ctx.beginPath();
        ctx.arc(cx, cy, bhr * 1.18, 0, Math.PI * 2);
        ctx.strokeStyle = photonGrd;
        ctx.lineWidth = 4;
        ctx.stroke();

        // Event horizon
        const ehGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, bhr);
        ehGrd.addColorStop(0, "#000000");
        ehGrd.addColorStop(0.85, "#000000");
        ehGrd.addColorStop(1, "rgba(0,0,0,0.85)");
        ctx.fillStyle = ehGrd;
        ctx.beginPath();
        ctx.arc(cx, cy, bhr, 0, Math.PI * 2);
        ctx.fill();

        // Render free/emitted squirrels
        renderSquirrels(ctx, s);

        // Advance level on click
        if (s.pointerActive && s.pointer) {
          const dx = s.pointer.x - cx;
          const dy = s.pointer.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < bhr * 1.5) {
            s.level += 1;
            s.phase = "transition";
            setPhase("transition");
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    // ── RENDER HELPERS ──────────────────────────────────────────

    function renderStars(
      ctx: CanvasRenderingContext2D,
      s: typeof stateRef.current,
      t: number
    ) {
      for (const star of s.stars) {
        const tw =
          0.5 + 0.5 * Math.sin(t * star.twinkleSpeed + star.twinkleOffset);
        ctx.globalAlpha = star.opacity * (0.4 + 0.6 * tw);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function renderParticles(
      ctx: CanvasRenderingContext2D,
      s: typeof stateRef.current,
      dt: number
    ) {
      s.particles = s.particles.filter((p) => p.life > 0);
      for (const p of s.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.life -= 0.04 * dt;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function renderSquirrels(
      ctx: CanvasRenderingContext2D,
      s: typeof stateRef.current
    ) {
      for (const sq of s.squirrels) {
        // Draw tail
        ctx.save();
        for (let i = 0; i < sq.tail.length; i++) {
          const seg = sq.tail[i];
          const alpha = 0.3 + 0.5 * (1 - i / sq.tail.length);
          const radius = Math.max(1, 3 - i * 0.35);

          // Tail segment dot
          ctx.globalAlpha = alpha * sq.scale;
          ctx.fillStyle = "#c09060";
          ctx.beginPath();
          ctx.arc(seg.x, seg.y, radius, 0, Math.PI * 2);
          ctx.fill();

          // Connection line to previous segment
          if (i === 0) {
            ctx.strokeStyle = `rgba(192,144,96,${alpha * 0.6 * sq.scale})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(sq.x, sq.y);
            ctx.lineTo(seg.x, seg.y);
            ctx.stroke();
          } else {
            const prev = sq.tail[i - 1];
            ctx.strokeStyle = `rgba(192,144,96,${alpha * 0.6 * sq.scale})`;
            ctx.lineWidth = Math.max(0.5, 2 - i * 0.25);
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(seg.x, seg.y);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // Draw body (emoji)
        ctx.save();
        ctx.translate(sq.x, sq.y);
        ctx.scale(sq.scale, sq.scale);
        ctx.font = "22px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🐿️", 0, 0);
        ctx.restore();

        // Glow for entangled squirrels
        if (sq.entangled) {
          ctx.save();
          ctx.globalAlpha = 0.15 + 0.08 * Math.sin(Date.now() * 0.005);
          const glow = ctx.createRadialGradient(
            sq.x,
            sq.y,
            5,
            sq.x,
            sq.y,
            25
          );
          glow.addColorStop(0, "#a855f7");
          glow.addColorStop(1, "rgba(168,85,247,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(sq.x, sq.y, 25, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.restore();
        }
      }
    }

    function renderEntanglementLinks(
      ctx: CanvasRenderingContext2D,
      s: typeof stateRef.current
    ) {
      for (const link of s.entanglementLinks) {
        const sq1 = s.squirrels.find((sq) => sq.id === link.s1);
        const sq2 = s.squirrels.find((sq) => sq.id === link.s2);
        if (!sq1 || !sq2) continue;
        const a = sq1.tail[link.t1];
        const b = sq2.tail[link.t2];
        if (!a || !b) continue;

        // Glowing entanglement line
        ctx.save();
        ctx.strokeStyle = "rgba(168,85,247,0.5)";
        ctx.lineWidth = 1.5;
        ctx.shadowColor = "#a855f7";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();

        // Sparkle at midpoint
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        ctx.fillStyle = "rgba(236,72,153,0.6)";
        ctx.beginPath();
        ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("touchstart", onDown);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onUp);
    };
  }, [spawnSquirrels, spawnStars]);

  const cfg = getLevelConfig(level);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none touch-none">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* HUD */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
        <div className="text-white/60 text-xs font-mono tracking-widest uppercase">
          Squirrel Singularity ·{" "}
          <span className="text-purple-400">Level {level}</span>
        </div>
        {phase === "playing" && (
          <>
            <div className="text-purple-300 text-xs font-mono">
              {entangledCount} / {ENTANGLE_THRESHOLD} entangled
            </div>
            <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    (entangledCount / ENTANGLE_THRESHOLD) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Bottom hints */}
      {phase === "playing" && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/30 text-xs font-mono text-center pointer-events-none">
          {level >= 2
            ? `Hold to pull · squirrels flee above level 2 · tangle ${ENTANGLE_THRESHOLD} tails together`
            : `Press & hold to pull squirrels together · tangle their tails · ${ENTANGLE_THRESHOLD} to create a black hole`}
        </div>
      )}

      {phase === "collapsing" && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-purple-300/80 text-sm font-mono text-center pointer-events-none animate-pulse">
          Singularity forming…
        </div>
      )}

      {phase === "blackhole" && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
          <div className="text-yellow-300/90 text-sm font-mono tracking-widest animate-pulse">
            BLACK HOLE ACHIEVED
          </div>
          <div className="text-white/40 text-xs font-mono">
            Click the black hole to advance to the next level
          </div>
        </div>
      )}

      {phase === "transition" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-white/80 text-xl font-mono tracking-widest animate-pulse">
            LEVEL {level + 1}
          </div>
        </div>
      )}
    </div>
  );
}
