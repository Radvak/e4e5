import { bucketsFor, type Speed } from '@prepa-cahier/core';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Perfs } from './api';

export type SpeedChoice = 'blitz' | 'rapid' | 'both';

const SPEEDS: Record<SpeedChoice, Speed[]> = { blitz: ['blitz'], rapid: ['rapid'], both: ['blitz', 'rapid'] };

interface Settings {
  speed: SpeedChoice;
  setSpeed: (s: SpeedChoice) => void;
}

const Ctx = createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [speed, setSpeedState] = useState<SpeedChoice>(
    () => (localStorage.getItem('speed') as SpeedChoice | null) ?? 'both',
  );
  const setSpeed = (s: SpeedChoice) => {
    localStorage.setItem('speed', s);
    setSpeedState(s);
  };
  return <Ctx.Provider value={{ speed, setSpeed }}>{children}</Ctx.Provider>;
}

export function useSettings(): Settings {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings outside SettingsProvider');
  return ctx;
}

/** Rating for the chosen speed(s): mean of the Lichess ratings of those speeds. */
export function ratingFor(perfs: Perfs | null | undefined, speed: SpeedChoice): number {
  const ratings = SPEEDS[speed].map((s) => perfs?.[s]).filter((p) => p && p.games > 0).map((p) => p!.rating);
  return ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : 1500;
}

export function explorerParams(perfs: Perfs | null | undefined, speed: SpeedChoice) {
  const rating = ratingFor(perfs, speed);
  return { rating, speeds: SPEEDS[speed], ratings: bucketsFor(rating) };
}
