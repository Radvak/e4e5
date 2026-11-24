/**
 * Stockfish 19 (lite, single-threaded WASM) in a Web Worker, shared by the whole app.
 *
 * One search at a time: when a new position is asked while a search runs, the engine is
 * stopped and the new search starts after its "bestmove" (so no stale lines are mixed in).
 */
import { parseInfo, uciFen, type EngineLine } from '@tabiya/core';

const ENGINE_URL = `${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`;

interface Search {
  fen: string;
  multipv: number;
  depth: number;
  onLine: (line: EngineLine) => void;
}

class Engine {
  private worker: Worker;
  private ready: Promise<void>;
  private current: Search | null = null;
  private pending: Search | null = null;
  private stopping = false;

  constructor() {
    this.worker = new Worker(ENGINE_URL);
    let resolveReady!: () => void;
    this.ready = new Promise((r) => (resolveReady = r));
    this.worker.onmessage = (e: MessageEvent<string>) => {
      const line = String(e.data);
      if (line === 'readyok') resolveReady();
      else if (line.startsWith('bestmove')) this.onBestMove();
      else if (line.startsWith('info') && this.current && !this.stopping) {
        const parsed = parseInfo(line, this.current.fen);
        if (parsed) this.current.onLine(parsed);
      }
    };
    this.send('uci');
    this.send('isready');
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private onBestMove() {
    this.current = null;
    this.stopping = false;
    if (this.pending) {
      const next = this.pending;
      this.pending = null;
      this.start(next);
    }
  }

  private start(s: Search) {
    this.current = s;
    this.send(`setoption name MultiPV value ${s.multipv}`);
    this.send(`position fen ${uciFen(s.fen)}`);
    this.send(`go depth ${s.depth}`);
  }

  /** Analyses `fen`; replaces any running search. */
  async analyse(s: Search) {
    await this.ready;
    if (this.current) {
      this.pending = s;
      if (!this.stopping) {
        this.stopping = true;
        this.send('stop');
      }
    } else {
      this.start(s);
    }
  }

  async stop() {
    await this.ready;
    this.pending = null;
    if (this.current && !this.stopping) {
      this.stopping = true;
      this.send('stop');
    }
  }
}

let engine: Engine | null = null;
/** The shared engine, created (and its ~2 MB downloaded) on first use. */
export function getEngine(): Engine {
  engine ??= new Engine();
  return engine;
}
