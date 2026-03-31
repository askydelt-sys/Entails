"use client";

import { useEffect, useRef, useState, useCallback } from "react";

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

const TAIL_SEGMENTS = 8;
const TAIL_SEGMENT_LENGTH = 6;
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
  inWell: boolean;
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

interface ScorePopup {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
}

interface TouchPulse {
  x: number;
  y: number;
  age: number;
  maxAge: number;
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
    touchPulses: [] as TouchPulse[],
    pointer: null as { x: number; y: number } | null,
    pointerActive: false,
    isTouch: false,
    phase: "playing" as Phase,
    blackHoleRadius: 0,
    blackHoleAge: 0,
    hawkingParticles: [] as Particle[],
    accretionAngle: 0,
    vortexPulse: 0,
    transitionAlpha: 0,
    level: 1,
    collapseProgress: 0,
    collapseCenterX: 0,
    collapseCenterY: 0,
    emissionTimer: 0,
    score: 0,
    combo: 0,
    lastCatchTime: 0,
    highScore: 0,
    scorePopups: [] as ScorePopup[],
  });
  const rafRef = useRef<number>(0);
  const [phase, setPhase] = useState<Phase>("playing");
  const [level, setLevel] = useState(1);
  const [inWellCount, setInWellCount] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [highScore, setHighScore] = useState(0);

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
          speed: randomBetween(
            cfg.squirrelSpeed * 0.7,
            cfg.squirrelSpeed * 1.4
          ),
          scale: 1,
          tail,
          inWell: false,
        });
      }
      stateRef.current.squirrels = squirrels;
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

  const spawnScorePopup = (x: number, y: number, text: string) => {
    stateRef.current.scorePopups.push({
      x: x + randomBetween(-20, 20),
      y,
      text,
      life: 1,
      maxLife: 1,
    });
  };

  const saveHighScore = () => {
    const s = stateRef.current;
    if (s.score > s.highScore) {
      s.highScore = s.score;
      setHighScore(s.score);
      try {
        localStorage.setItem("squirrel-singularity-high-score", String(s.score));
      } catch {}
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      } else {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
      spawnStars(canvas.width, canvas.height);
      if (stateRef.current.squirrels.length === 0) {
        spawnSquirrels(canvas.width, canvas.height, stateRef.current.level);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    try {
      const stored = localStorage.getItem("squirrel-singularity-high-score");
      if (stored) {
        stateRef.current.highScore = parseInt(stored, 10) || 0;
        setHighScore(stateRef.current.highScore);
      }
    } catch {}

    const getPos = (e: MouseEvent | Touch): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const isTouchEvent = "touches" in e;
      const pos = isTouchEvent ? getPos(e.touches[0]) : getPos(e as MouseEvent);
      stateRef.current.pointer = pos;
      stateRef.current.pointerActive = true;
      stateRef.current.isTouch = isTouchEvent;
      if (isTouchEvent) {
        stateRef.current.touchPulses.push({
          x: pos.x,
          y: pos.y,
          age: 0,
          maxAge: 30,
        });
        navigator.vibrate?.(15);
      }
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
    canvas.addEventListener("touchcancel", onUp);

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

      const first = segs[0];
      const dx0 = first.x - sq.x;
      const dy0 = first.y - sq.y;
      const d0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
      if (d0 > TAIL_SEGMENT_LENGTH) {
        const f = (d0 - TAIL_SEGMENT_LENGTH) / d0;
        first.x -= dx0 * f;
        first.y -= dy0 * f;
      }

      for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < segs.length - 1; i++) {
          const a = segs[i];
          const b = segs[i + 1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 0.001) {
            const f = ((d - TAIL_SEGMENT_LENGTH) / d) * 0.5;
            a.x += dx * f;
            a.y += dy * f;
            b.x -= dx * f;
            b.y -= dy * f;
          }
        }
      }

      for (const seg of segs) {
        seg.x = Math.max(5, Math.min(canvas!.width - 5, seg.x));
        seg.y = Math.max(5, Math.min(canvas!.height - 5, seg.y));
      }
    }

    let lastTime = 0;

    function updateAndRenderPopups(
      ctx: CanvasRenderingContext2D,
      s: typeof stateRef.current,
      dt: number
    ) {
      s.scorePopups = s.scorePopups.filter((p) => p.life > 0);
      for (const p of s.scorePopups) {
        p.y -= 0.8 * dt;
        p.life -= 0.02 * dt;
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.text.includes("x") ? "#f59e0b" : "#a855f7";
        ctx.font = "bold 18px monospace";
        ctx.textAlign = "center";
        ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;
    }

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

        const entangledSq = s.squirrels.filter((sq) => sq.inWell);
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
            const sd =
              Math.sqrt(sdx * sdx + sdy * sdy) * (1 - 0.04 * dt);
            seg.x = tcx + Math.cos(sa) * sd;
            seg.y = tcy + Math.sin(sa) * sd;
            seg.px = seg.x;
            seg.py = seg.y;
          }

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

        if (s.collapseProgress >= 1) {
          s.phase = "blackhole";
          setPhase("blackhole");
          navigator.vibrate?.([50, 30, 80, 30, 120]);
          s.blackHoleRadius = 15;
          s.blackHoleAge = 0;
          s.emissionTimer = 0;
          s.squirrels = s.squirrels.filter((sq) => !sq.inWell);
          s.collapseProgress = 0;
          setInWellCount(0);

          const bonus = 500 * s.level;
          s.score += bonus;
          s.combo = 0;
          setScore(s.score);
          setCombo(0);
          saveHighScore();
          spawnScorePopup(s.collapseCenterX, s.collapseCenterY - 30, `+${bonus} BLACK HOLE!`);
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

        ctx.fillStyle = "#050508";
        ctx.fillRect(0, 0, w, h);
        renderStars(ctx, s, t);
        renderParticles(ctx, s, dt);
        renderSquirrels(ctx, s);

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

        updateAndRenderPopups(ctx, s, dt);

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
          s.collapseProgress = 0;
          s.emissionTimer = 0;
          s.phase = "playing";
          setPhase("playing");
          setInWellCount(0);
          setLevel(s.level);
          spawnSquirrels(w, h, s.level);
          spawnStars(w, h);
        }
        updateAndRenderPopups(ctx, s, dt);
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      ctx.fillStyle = "#050508";
      ctx.fillRect(0, 0, w, h);

      // ── STARS ────────────────────────────────────────────────
      renderStars(ctx, s, t);

      // ── PLAYING PHYSICS ──────────────────────────────────────
      if (s.phase === "playing") {
        if (s.pointerActive && s.pointer) {
          s.vortexPulse += 0.08 * dt;
          const pulse = 1 + 0.12 * Math.sin(s.vortexPulse);
          const mobileBoost = s.isTouch ? 1.4 : 1;
          const effectiveRadius = cfg.gravityRadius * pulse * mobileBoost;
          const grd = ctx.createRadialGradient(
            s.pointer.x,
            s.pointer.y,
            0,
            s.pointer.x,
            s.pointer.y,
            effectiveRadius
          );
          grd.addColorStop(0, "rgba(168,85,247,0.45)");
          grd.addColorStop(0.4, "rgba(124,58,237,0.2)");
          grd.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(
            s.pointer.x,
            s.pointer.y,
            effectiveRadius,
            0,
            Math.PI * 2
          );
          ctx.fill();

          const ringScale = s.isTouch ? 1.5 : 1;
          ctx.strokeStyle = `rgba(168,85,247,${0.4 + 0.2 * Math.sin(s.vortexPulse)})`;
          ctx.lineWidth = s.isTouch ? 2.5 : 1.5;
          ctx.beginPath();
          ctx.arc(s.pointer.x, s.pointer.y, 40 * ringScale, 0, Math.PI * 2);
          ctx.stroke();

          ctx.strokeStyle = `rgba(236,72,153,${0.2 + 0.15 * Math.sin(s.vortexPulse * 1.3)})`;
          ctx.lineWidth = s.isTouch ? 1.5 : 1;
          ctx.beginPath();
          ctx.arc(s.pointer.x, s.pointer.y, 55 * ringScale, 0, Math.PI * 2);
          ctx.stroke();
        }

        let currentInWell = 0;
        const now = performance.now();
        for (const sq of s.squirrels) {
          const wasInWell = sq.inWell;
          sq.inWell = false;
          if (s.pointerActive && s.pointer) {
            const dx = s.pointer.x - sq.x;
            const dy = s.pointer.y - sq.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const mobileBoost = s.isTouch ? 1.4 : 1;
            const effectiveGravityRadius = cfg.gravityRadius * mobileBoost;

            if (cfg.fleeRadius > 0 && dist < cfg.fleeRadius) {
              const flee = (1 - dist / cfg.fleeRadius) * cfg.fleeForce;
              sq.vx -= (dx / dist) * flee * dt;
              sq.vy -= (dy / dist) * flee * dt;
            } else if (dist < effectiveGravityRadius && dist > 1) {
              const force = (1 - dist / effectiveGravityRadius) * 0.5;
              sq.vx += (dx / dist) * force * dt;
              sq.vy += (dy / dist) * force * dt;
              sq.inWell = true;
              currentInWell++;

              if (!wasInWell) {
                if (now - s.lastCatchTime < 2000) {
                  s.combo = s.combo + 1;
                } else {
                  s.combo = 1;
                }
                s.lastCatchTime = now;
                const points = 10 * s.combo;
                s.score += points;
                setScore(s.score);
                setCombo(s.combo);
                saveHighScore();
                spawnScorePopup(
                  sq.x,
                  sq.y,
                  s.combo > 1 ? `+${points} x${s.combo}` : `+${points}`
                );
              }
            }
          }

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

          updateTailPhysics(sq, dt);
        }

        setInWellCount(currentInWell);

        if (s.combo > 0 && now - s.lastCatchTime >= 2000) {
          s.combo = 0;
          setCombo(0);
        }

        if (currentInWell >= ENTANGLE_THRESHOLD && s.phase === "playing") {
          s.phase = "collapsing";
          setPhase("collapsing");
          s.collapseProgress = 0;
          const inWellSq = s.squirrels.filter((sq) => sq.inWell);
          let tcx = 0,
            tcy = 0;
          for (const sq of inWellSq) {
            tcx += sq.x;
            tcy += sq.y;
          }
          s.collapseCenterX = tcx / inWellSq.length;
          s.collapseCenterY = tcy / inWellSq.length;
        }

        renderSquirrels(ctx, s);
      }

      // ── PARTICLES ────────────────────────────────────────────
      renderParticles(ctx, s, dt);

      // ── TOUCH PULSES ────────────────────────────────────────
      s.touchPulses = s.touchPulses.filter((p) => p.age < p.maxAge);
      for (const p of s.touchPulses) {
        p.age += dt;
        const progress = p.age / p.maxAge;
        const radius = 10 + progress * 50;
        const alpha = (1 - progress) * 0.6;
        ctx.strokeStyle = `rgba(168,85,247,${alpha})`;
        ctx.lineWidth = 2 * (1 - progress);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ── BLACK HOLE ───────────────────────────────────────────
      if (s.phase === "blackhole") {
        s.blackHoleRadius += 0.4 * dt;
        s.blackHoleRadius = Math.min(s.blackHoleRadius, 120);
        s.blackHoleAge += dt;
        s.accretionAngle += 0.02 * dt;

        const bhr = s.blackHoleRadius;

        s.emissionTimer += dt;
        if (s.emissionTimer > 200) {
          s.emissionTimer = 0;
          if (s.squirrels.length < 60) {
            const emitAngle = Math.random() * Math.PI * 2;
            const emitR = bhr + 8;
            const ex = cx + Math.cos(emitAngle) * emitR;
            const ey = cy + Math.sin(emitAngle) * emitR;
            const speed = cfg.squirrelSpeed * 1.8;

            const tail1: Squirrel["tail"] = [];
            for (let j = 0; j < TAIL_SEGMENTS; j++) {
              tail1.push({
                x:
                  ex -
                  Math.cos(emitAngle) * TAIL_SEGMENT_LENGTH * (j + 1),
                y:
                  ey -
                  Math.sin(emitAngle) * TAIL_SEGMENT_LENGTH * (j + 1),
                px:
                  ex -
                  Math.cos(emitAngle) * TAIL_SEGMENT_LENGTH * (j + 1),
                py:
                  ey -
                  Math.sin(emitAngle) * TAIL_SEGMENT_LENGTH * (j + 1),
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
              inWell: false,
            });

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
              inWell: false,
            });
          }
        }

        for (const sq of s.squirrels) {
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

          updateTailPhysics(sq, dt);

          if (dist < bhr + 5) {
            sq.inWell = true;
            sq.scale = 0;
            spawnAbsorbParticles(sq.x, sq.y);
          }
        }
        s.squirrels = s.squirrels.filter((sq) => !sq.inWell);

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

        const ehGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, bhr);
        ehGrd.addColorStop(0, "#000000");
        ehGrd.addColorStop(0.85, "#000000");
        ehGrd.addColorStop(1, "rgba(0,0,0,0.85)");
        ctx.fillStyle = ehGrd;
        ctx.beginPath();
        ctx.arc(cx, cy, bhr, 0, Math.PI * 2);
        ctx.fill();

        renderSquirrels(ctx, s);

        if (s.pointerActive && s.pointer) {
          const dx = s.pointer.x - cx;
          const dy = s.pointer.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < bhr * 1.5) {
            s.level += 1;
            s.phase = "transition";
            setPhase("transition");
            navigator.vibrate?.([30, 20, 30, 20, 60]);
          }
        }
      }

      updateAndRenderPopups(ctx, s, dt);

      rafRef.current = requestAnimationFrame(loop);
    };

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
        // ── PUFFY TAIL ──────────────────────────────────────────
        ctx.save();
        for (let i = sq.tail.length - 1; i >= 0; i--) {
          const seg = sq.tail[i];
          const progress = i / sq.tail.length;
          const radius = 9 - progress * 5;
          const alpha = 0.7 - progress * 0.35;

          ctx.globalAlpha = alpha * sq.scale;

          // Outer fuzz halo
          const fuzzR = radius + 3;
          const fuzzGrd = ctx.createRadialGradient(
            seg.x,
            seg.y,
            radius * 0.3,
            seg.x,
            seg.y,
            fuzzR
          );
          fuzzGrd.addColorStop(0, `rgba(210,170,120,${alpha * 0.7})`);
          fuzzGrd.addColorStop(0.5, `rgba(185,140,90,${alpha * 0.4})`);
          fuzzGrd.addColorStop(1, "rgba(160,120,70,0)");
          ctx.fillStyle = fuzzGrd;
          ctx.beginPath();
          ctx.arc(seg.x, seg.y, fuzzR, 0, Math.PI * 2);
          ctx.fill();

          // Core puff with highlight
          const coreGrd = ctx.createRadialGradient(
            seg.x - radius * 0.15,
            seg.y - radius * 0.15,
            0,
            seg.x,
            seg.y,
            radius
          );
          coreGrd.addColorStop(0, `rgba(235,200,155,${alpha})`);
          coreGrd.addColorStop(0.6, `rgba(200,155,100,${alpha * 0.8})`);
          coreGrd.addColorStop(1, `rgba(170,125,75,${alpha * 0.3})`);
          ctx.fillStyle = coreGrd;
          ctx.beginPath();
          ctx.arc(seg.x, seg.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // Glow for squirrels in the gravity well
        if (sq.inWell) {
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

        // Draw body (emoji)
        ctx.save();
        ctx.translate(sq.x, sq.y);
        ctx.scale(sq.scale, sq.scale);
        ctx.font = "22px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🐿️", 0, 0);
        ctx.restore();
      }
    }

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      saveHighScore();
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("touchstart", onDown);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onUp);
      canvas.removeEventListener("touchcancel", onUp);
    };
  }, [spawnSquirrels, spawnStars]);

  const cfg = getLevelConfig(level);

  return (
    <div
      className="relative overflow-hidden bg-black select-none"
      style={{
        touchAction: "none",
        width: "100vw",
        height: "100dvh",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* HUD */}
      <div
        className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
      >
        <div className="text-white/60 text-xs font-mono tracking-widest uppercase">
          Squirrel Singularity ·{" "}
          <span className="text-purple-400">Level {level}</span>
        </div>
        <div className="flex items-center gap-4 text-sm font-mono">
          <span className="text-purple-300">{score}</span>
          {combo > 1 && (
            <span className="text-yellow-400 animate-pulse">x{combo}</span>
          )}
          {highScore > 0 && (
            <span className="text-white/30 text-xs">HI {highScore}</span>
          )}
        </div>
        {phase === "playing" && (
          <>
            <div className="text-purple-300 text-xs font-mono">
              {inWellCount} / {ENTANGLE_THRESHOLD} in well
            </div>
            <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    (inWellCount / ENTANGLE_THRESHOLD) * 100,
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
        <div
          className="absolute left-1/2 -translate-x-1/2 text-white/30 text-xs font-mono text-center pointer-events-none"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}
        >
          {level >= 2
            ? `Hold to pull · squirrels flee above level 2 · pull ${ENTANGLE_THRESHOLD} into the well`
            : `Press & hold to pull squirrels in · gather ${ENTANGLE_THRESHOLD} in the well to create a black hole`}
        </div>
      )}

      {phase === "collapsing" && (
        <div
          className="absolute left-1/2 -translate-x-1/2 text-purple-300/80 text-sm font-mono text-center pointer-events-none animate-pulse"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}
        >
          Singularity forming…
        </div>
      )}

      {phase === "blackhole" && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}
        >
          <div className="text-yellow-300/90 text-sm font-mono tracking-widest animate-pulse">
            BLACK HOLE ACHIEVED
          </div>
          <div className="text-white/40 text-xs font-mono">
            Tap the black hole to advance to the next level
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
