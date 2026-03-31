"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkleSpeed: number;
  twinkleOffset: number;
}

const ORBIT_SQUIRRELS = 6;
const ORBIT_RADIUS = 120;

export default function SplashScreen({
  onStart,
}: {
  onStart: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  const handleStart = useCallback(() => {
    if (fading) return;
    setFading(true);
    setTimeout(() => {
      setHidden(true);
      onStart();
    }, 800);
  }, [fading, onStart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const stars: Star[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      stars.length = 0;
      for (let i = 0; i < 150; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 2.5 + 0.5,
          opacity: Math.random() * 0.7 + 0.3,
          twinkleSpeed: Math.random() * 2 + 0.5,
          twinkleOffset: Math.random() * Math.PI * 2,
        });
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = (time: number) => {
      const t = time / 1000;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = "#050508";
      ctx.fillRect(0, 0, w, h);

      // Nebula glow
      const nebula = ctx.createRadialGradient(
        w / 2,
        h / 2,
        50,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.5
      );
      nebula.addColorStop(0, "rgba(88,28,135,0.15)");
      nebula.addColorStop(0.3, "rgba(124,58,237,0.08)");
      nebula.addColorStop(0.6, "rgba(59,7,100,0.04)");
      nebula.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = nebula;
      ctx.fillRect(0, 0, w, h);

      // Stars
      for (const star of stars) {
        const tw =
          0.5 + 0.5 * Math.sin(t * star.twinkleSpeed + star.twinkleOffset);
        ctx.globalAlpha = star.opacity * (0.4 + 0.6 * tw);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Center ring glow
      const ringPulse = 1 + 0.15 * Math.sin(t * 1.5);
      const ring = ctx.createRadialGradient(
        w / 2,
        h / 2,
        ORBIT_RADIUS * 0.8 * ringPulse,
        w / 2,
        h / 2,
        ORBIT_RADIUS * 1.6 * ringPulse
      );
      ring.addColorStop(0, "rgba(168,85,247,0.06)");
      ring.addColorStop(0.5, "rgba(124,58,237,0.03)");
      ring.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, ORBIT_RADIUS * 1.6 * ringPulse, 0, Math.PI * 2);
      ctx.fill();

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const orbitSquirrels = Array.from({ length: ORBIT_SQUIRRELS }, (_, i) => {
    const angleOffset = (i / ORBIT_SQUIRRELS) * 360;
    const duration = 8 + i * 1.5;
    const radius = ORBIT_RADIUS + (i % 2) * 30;
    const direction = i % 2 === 0 ? "normal" : "reverse";
    const delay = -(i * (duration / ORBIT_SQUIRRELS));
    const size = 24 + (i % 3) * 4;

    return (
      <div
        key={i}
        className="absolute left-1/2 top-1/2 pointer-events-none"
        style={{
          animation: `orbit-${i} ${duration}s linear infinite ${direction}`,
          animationDelay: `${delay}s`,
        }}
      >
        <style>{`
          @keyframes orbit-${i} {
            from { transform: rotate(${angleOffset}deg) translateX(${radius}px) rotate(-${angleOffset}deg); }
            to { transform: rotate(${angleOffset + 360}deg) translateX(${radius}px) rotate(-${angleOffset + 360}deg); }
          }
        `}</style>
        <span
          className="block"
          style={{
            fontSize: `${size}px`,
            marginLeft: `-${size / 2}px`,
            marginTop: `-${size / 2}px`,
            filter: `drop-shadow(0 0 ${4 + i * 2}px rgba(168,85,247,0.5))`,
          }}
        >
          🐿️
        </span>
      </div>
    );
  });

  if (hidden) return null;

  return (
    <div
      className={`absolute inset-0 z-50 flex flex-col items-center justify-center cursor-pointer select-none transition-opacity duration-700 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleStart}
      onTouchEnd={handleStart}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Orbiting squirrels */}
      {orbitSquirrels}

      {/* Title */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        <h1
          className="text-5xl sm:text-7xl font-bold tracking-tight text-center"
          style={{
            background: "linear-gradient(135deg, #a855f7, #ec4899, #f59e0b)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "none",
            filter: "drop-shadow(0 0 30px rgba(168,85,247,0.4))",
          }}
        >
          Squirrel
          <br />
          Singularity
        </h1>

        {/* Subtitle */}
        <p className="text-white/40 text-sm sm:text-base font-mono tracking-[0.3em] uppercase">
          A Cosmic Convergence
        </p>

        {/* Click to start */}
        <div
          className="mt-8 text-white/60 text-sm font-mono tracking-widest uppercase"
          style={{
            animation: "pulse-glow 2s ease-in-out infinite",
          }}
        >
          Click to Start
        </div>
      </div>

      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.4; text-shadow: 0 0 10px rgba(168,85,247,0.3); }
          50% { opacity: 1; text-shadow: 0 0 20px rgba(168,85,247,0.6); }
        }
      `}</style>
    </div>
  );
}
