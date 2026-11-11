import { bucketsFor, RATING_BUCKETS, type Speed } from '@prepa-cahier/core';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Me } from './api';

export type SpeedChoice = 'blitz' | 'rapid' | 'both' | 'all';

export const SPEEDS: Record<SpeedChoice, Speed[]> = {
  blitz: ['blitz'],
  rapid: ['rapid'],
  both: ['blitz', 'rapid'],
  all: ['blitz', 'rapid', 'classical'],
};

/** Lichess explorer rating range, as [lowest bucket, highest bucket] (e.g. [1600, 1800] = 1600-1999). */
export type RatingRange = [number, number];

interface Settings {
  speed: SpeedChoice;
  setSpeed: (s: SpeedChoice) => void;
  /** null: automatic, from the user's own rating. */
  range: RatingRange | null;
  setRange: (r: RatingRange | null) => void;
}

const Ctx = createContext<Settings | null>(null);

function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function persist(key: string, value: unknown) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [speed, setSpeedState] = useState<SpeedChoice>(() => stored('speed', 'both'));
  const [range, setRangeState] = useState<RatingRange | null>(() => stored('ratingRange', null));
  const setSpeed = (s: SpeedChoice) => {
    persist('speed', s);
    setSpeedState(s);
  };
  const setRange = (r: RatingRange | null) => {
    persist('ratingRange', r);
    setRangeState(r);
  };
  return <Ctx.Provider value={{ speed, setSpeed, range, setRange }}>{children}</Ctx.Provider>;
}

export function useSettings(): Settings {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings outside SettingsProvider');
  return ctx;
}

function mean(xs: number[]): number | null {
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

/**
 * The user's own rating for the chosen speed(s), used for the default explorer range:
 * Lichess if linked, else Chess.com as-is (the user adjusts the range), else 1500.
 */
export function ratingFor(me: Me, speed: SpeedChoice): { rating: number; source: 'Lichess' | 'Chess.com' | null } {
  const lichess = mean(
    SPEEDS[speed].map((s) => me.lichess?.perfs?.[s]).filter((p) => p && p.games > 0).map((p) => p!.rating),
  );
  if (lichess) return { rating: lichess, source: 'Lichess' };
  const ratings = me.chesscom?.ratings;
  const chesscom = mean(SPEEDS[speed].map((s) => (s === 'blitz' || s === 'rapid' ? ratings?.[s] : undefined)).filter((r): r is number => !!r));
  if (chesscom) return { rating: chesscom, source: 'Chess.com' };
  return { rating: 1500, source: null };
}

/** Upper bound (inclusive) of a Lichess explorer bucket, or null for the top one. */
export function bucketTop(bucket: number): number | null {
  const next = RATING_BUCKETS.find((b) => b > bucket);
  return next === undefined ? null : next - 1;
}

/** "1600–1999", "2500+", "0–999". */
export function rangeLabel(buckets: number[]): string {
  const lo = Math.min(...buckets);
  const top = bucketTop(Math.max(...buckets));
  return top === null ? `${lo}+` : `${lo}–${top}`;
}

export function explorerParams(me: Me, speed: SpeedChoice, range: RatingRange | null) {
  const { rating, source } = ratingFor(me, speed);
  const ratings = range
    ? RATING_BUCKETS.filter((b) => b >= range[0] && b <= range[1])
    : bucketsFor(rating);
  return { rating, source, speeds: SPEEDS[speed], ratings, auto: range === null };
}
