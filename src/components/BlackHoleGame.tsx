"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const SQUIRREL_COUNT = 30;
const ABSORB_THRESHOLD = 25;
const GRAVITY_RADIUS = 180;
const ABSORB_RADIUS = 28;

interface Squirrel {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  absorbed: boolean;
  absorbProgress: number;
  scale: number;
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

type Phase = "playing" | "forming" | "blackhole";

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
    absorbedCount: 0,
    phase: "playing" as Phase,
    blackHoleRadius: 0,
    blackHoleAge: 0,
    hawkingParticles: [] as Particle[],
    accretionAngle: 0,
    vortexPulse: 0,
  });
  const rafRef = useRef<number>(0);
  const [phase, setPhase] = useState<Phase>("playing");
  const [absorbedCount, setAbsorbedCount] = useState(0);

  const spawnSquirrels = useCallback((w: number, h: number) => {
    const squirrels: Squirrel[] = [];
    for (let i = 0; i < SQUIRREL_COUNT; i++) {
      squirrels.push({
        id: i,
        x: randomBetween(40, w - 40),
        y: randomBetween(40, h - 40),
        vx: randomBetween(-1.2, 1.2),
        vy: randomBetween(-1.2, 1.2),
        angle: Math.random() * Math.PI * 2,
        speed: randomBetween(0.6, 1.4),
        absorbed: false,
        absorbProgress: 0,
        scale: 1,
      });
    }
    stateRef.current.squirrels = squirrels;
  }, []);

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
        spawnSquirrels(canvas.width, canvas.height);
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
      const pos = "touches" in e ? getPos(e.touches[0]) : getPos(e as MouseEvent);
      stateRef.current.pointer = pos;
      stateRef.current.pointerActive = true;
    };
    const onMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!stateRef.current.pointerActive) return;
      const pos = "touches" in e ? getPos(e.touches[0]) : getPos(e as MouseEvent);
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

    let lastTime = 0;

    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 16, 3);
      lastTime = time;
      const s = stateRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      ctx.fillStyle = "#050508";
      ctx.fillRect(0, 0, w, h);

      // Stars
      const t = time / 1000;
      for (const star of s.stars) {
        const tw = 0.5 + 0.5 * Math.sin(t * star.twinkleSpeed + star.twinkleOffset);
        ctx.globalAlpha = star.opacity * (0.4 + 0.6 * tw);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (s.phase === "playing" || s.phase === "forming") {
        // Gravity well
        if (s.pointerActive && s.pointer) {
          s.vortexPulse += 0.08 * dt;
          const pulse = 1 + 0.12 * Math.sin(s.vortexPulse);
          const grd = ctx.createRadialGradient(
            s.pointer.x, s.pointer.y, 0,
            s.pointer.x, s.pointer.y, GRAVITY_RADIUS * pulse
          );
          grd.addColorStop(0, "rgba(168,85,247,0.35)");
          grd.addColorStop(0.4, "rgba(124,58,237,0.15)");
          grd.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(s.pointer.x, s.pointer.y, GRAVITY_RADIUS * pulse, 0, Math.PI * 2);
          ctx.fill();

          // Vortex ring
          ctx.strokeStyle = `rgba(168,85,247,${0.3 + 0.2 * Math.sin(s.vortexPulse)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(s.pointer.x, s.pointer.y, ABSORB_RADIUS * 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Update squirrels
        for (const sq of s.squirrels) {
          if (sq.absorbed) continue;

          if (s.pointerActive && s.pointer) {
            const dx = s.pointer.x - sq.x;
            const dy = s.pointer.y - sq.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < ABSORB_RADIUS) {
              sq.absorbProgress += 0.08 * dt;
              sq.scale = 1 - sq.absorbProgress;
              if (sq.absorbProgress >= 1) {
                sq.absorbed = true;
                s.absorbedCount++;
                spawnAbsorbParticles(sq.x, sq.y);
                setAbsorbedCount(s.absorbedCount);
                if (s.absorbedCount >= ABSORB_THRESHOLD && s.phase === "playing") {
                  s.phase = "forming";
                  setPhase("forming");
                  setTimeout(() => {
                    s.phase = "blackhole";
                    setPhase("blackhole");
                  }, 1500);
                }
              }
            } else if (dist < GRAVITY_RADIUS) {
              const force = (1 - dist / GRAVITY_RADIUS) * 0.5;
              sq.vx += (dx / dist) * force * dt;
              sq.vy += (dy / dist) * force * dt;
            }
          }

          // Wander
          sq.angle += randomBetween(-0.08, 0.08) * dt;
          sq.vx += Math.cos(sq.angle) * 0.03 * dt;
          sq.vy += Math.sin(sq.angle) * 0.03 * dt;

          // Speed limit
          const spd = Math.sqrt(sq.vx * sq.vx + sq.vy * sq.vy);
          if (spd > sq.speed * 2) {
            sq.vx = (sq.vx / spd) * sq.speed * 2;
            sq.vy = (sq.vy / spd) * sq.speed * 2;
          }

          sq.x += sq.vx * dt;
          sq.y += sq.vy * dt;

          // Bounce
          if (sq.x < 20) { sq.x = 20; sq.vx = Math.abs(sq.vx); }
          if (sq.x > w - 20) { sq.x = w - 20; sq.vx = -Math.abs(sq.vx); }
          if (sq.y < 20) { sq.y = 20; sq.vy = Math.abs(sq.vy); }
          if (sq.y > h - 20) { sq.y = h - 20; sq.vy = -Math.abs(sq.vy); }
        }

        // Draw squirrels
        ctx.font = "22px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const sq of s.squirrels) {
          if (sq.absorbed) continue;
          ctx.save();
          ctx.translate(sq.x, sq.y);
          ctx.scale(sq.scale, sq.scale);
          ctx.fillText("🐿️", 0, 0);
          ctx.restore();
        }
      }

      // Particles
      s.particles = s.particles.filter(p => p.life > 0);
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

      // Black hole phase
      if (s.phase === "forming" || s.phase === "blackhole") {
        s.blackHoleRadius += (s.phase === "forming" ? 2 : 0.4) * dt;
        s.blackHoleRadius = Math.min(s.blackHoleRadius, 120);
        s.blackHoleAge += dt;
        s.accretionAngle += 0.02 * dt;

        const bhr = s.blackHoleRadius;

        // Suck remaining squirrels in
        for (const sq of s.squirrels) {
          if (sq.absorbed) continue;
          const dx = cx - sq.x;
          const dy = cy - sq.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const force = 3000 / (dist * dist + 100);
          sq.vx += (dx / dist) * force * dt;
          sq.vy += (dy / dist) * force * dt;
          sq.x += sq.vx * dt;
          sq.y += sq.vy * dt;
          if (dist < bhr + 10) {
            sq.absorbed = true;
            spawnAbsorbParticles(sq.x, sq.y);
          }
        }

        // Hawking radiation
        if (s.phase === "blackhole" && Math.random() < 0.3) {
          const angle = Math.random() * Math.PI * 2;
          const r = bhr + randomBetween(2, 8);
          s.hawkingParticles.push({
            x: cx + Math.cos(angle) * r,
            y: cy + Math.sin(angle) * r,
            vx: Math.cos(angle) * randomBetween(0.5, 2),
            vy: Math.sin(angle) * randomBetween(0.5, 2),
            life: 1,
            maxLife: 1,
            color: `hsl(${Math.random() * 60 + 200}, 100%, 70%)`,
          });
        }

        s.hawkingParticles = s.hawkingParticles.filter(p => p.life > 0);
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
        const outerGlow = ctx.createRadialGradient(cx, cy, bhr * 0.5, cx, cy, bhr * 3.5);
        outerGlow.addColorStop(0, "rgba(88,28,135,0.5)");
        outerGlow.addColorStop(0.4, "rgba(59,7,100,0.25)");
        outerGlow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, bhr * 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Accretion disk rings
        const diskColors = [
          "rgba(251,191,36,0.25)",
          "rgba(245,158,11,0.18)",
          "rgba(234,88,12,0.12)",
        ];
        for (let ring = 0; ring < 3; ring++) {
          const rx = bhr * (1.8 + ring * 0.6);
          const ry = bhr * (0.35 + ring * 0.1);
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(s.accretionAngle + ring * 0.4);
          ctx.beginPath();
          ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
          ctx.strokeStyle = diskColors[ring];
          ctx.lineWidth = 3 - ring;
          ctx.stroke();
          ctx.restore();
        }

        // Photon ring
        ctx.beginPath();
        ctx.arc(cx, cy, bhr * 1.18, 0, Math.PI * 2);
        const photonGrd = ctx.createRadialGradient(cx, cy, bhr * 1.0, cx, cy, bhr * 1.35);
        photonGrd.addColorStop(0, "rgba(253,224,71,0.0)");
        photonGrd.addColorStop(0.5, "rgba(253,224,71,0.55)");
        photonGrd.addColorStop(1, "rgba(253,224,71,0.0)");
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

        // Draw remaining squirrels on top of black hole bg
        if (s.phase === "forming") {
          ctx.font = "22px serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          for (const sq of s.squirrels) {
            if (sq.absorbed) continue;
            ctx.save();
            ctx.translate(sq.x, sq.y);
            ctx.fillText("🐿️", 0, 0);
            ctx.restore();
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

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

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none touch-none">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* HUD */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
        <div className="text-white/80 text-sm font-mono tracking-widest uppercase">
          Squirrel Singularity
        </div>
        {phase === "playing" && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-purple-300 text-xs font-mono">{absorbedCount} / {ABSORB_THRESHOLD} squirrels</span>
            </div>
            <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.min((absorbedCount / ABSORB_THRESHOLD) * 100, 100)}%` }}
              />
            </div>
          </>
        )}
      </div>

      {phase === "playing" && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/40 text-xs font-mono text-center pointer-events-none">
          Press &amp; hold to create a gravity well · Absorb {ABSORB_THRESHOLD} squirrels
        </div>
      )}

      {phase === "forming" && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-purple-300/80 text-sm font-mono text-center pointer-events-none animate-pulse">
          Singularity forming…
        </div>
      )}

      {phase === "blackhole" && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
          <div className="text-yellow-300/90 text-sm font-mono tracking-widest animate-pulse">
            ✦ BLACK HOLE ACHIEVED ✦
          </div>
          <div className="text-white/40 text-xs font-mono">Hawking radiation detected</div>
        </div>
      )}
    </div>
  );
}
