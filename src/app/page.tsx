"use client";

import { useState, useCallback } from "react";
import BlackHoleGame from "@/components/BlackHoleGame";
import SplashScreen from "@/components/SplashScreen";

export default function Home() {
  const [started, setStarted] = useState(false);

  const handleStart = useCallback(() => {
    setStarted(true);
  }, []);

  return (
    <>
      {!started && <SplashScreen onStart={handleStart} />}
      <BlackHoleGame />
    </>
  );
}
