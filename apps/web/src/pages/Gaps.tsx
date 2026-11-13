import type { Color } from '@prepa-cahier/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Gap, type GapReport, type Me, type RepertoireSummary } from '../api';
import { RatingRange } from '../components/RatingRange';
import { explorerParams, useSettings } from '../settings';

const CUTOFFS = [0.005, 0.01, 0.02, 0.05];
const COLORS: Color[] = ['white', 'black'];

const pct = (x: number) => (x > 0 && x < 0.01 ? `${(100 * x).toFixed(1)}%` : `${Math.round(100 * x)}%`);

/** "1. e4 c5 2. Nf3" (SAN moves from the initial position). */
function lineText(sans: string[]): string {
  return sans.map((san, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${san}`).join(' ');
}

/** The move after `line`, numbered when needed: "3. Bb5", "d6" after "2. Nf3", "1... e5" alone. */
function nextMove(line: string[], san: string): string {
  const ply = line.length;
  if (ply % 2 === 0) return `${ply / 2 + 1}. ${san}`;
  return ply > 0 ? san : `1... ${san}`;
}

/** "5.0 moves", "≥ 3.8 moves" when some games reach positions without statistics. */
function moves(n: number, unknown = 0): string {
  return `${unknown >= 0.01 ? '≥ ' : ''}${n.toFixed(1)} moves`;
}

function status(r: GapReport): string {
  if (r.pending > 0) return `fetching statistics for ${r.pending} position${r.pending > 1 ? 's' : ''}…`;
  const notes: string[] = [];
  if (r.missing > 0) notes.push(`${r.missing} position${r.missing > 1 ? 's' : ''} without statistics`);
  if (r.approximate > 0) notes.push(`${r.approximate} with statistics of another rating range`);
  if (r.truncated) notes.push('repertoire too large, partial analysis');
  return notes.join(' · ');
}

export function Gaps({ me }: { me: Me }) {
  const { speed, range } = useSettings();
  const ex = explorerParams(me, speed, range);
  const [params, setParams] = useSearchParams();
  const [cutoff, setCutoff] = useState(() => Number(localStorage.getItem('gapCutoff')) || 0.01);
  const all = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
  const gaps = useQuery({
    queryKey: ['gaps', ex.speeds, ex.ratings, cutoff],
    queryFn: () => api.gaps(ex.speeds, ex.ratings, cutoff),
    // Statistics are fetched in the background: ask again until nothing is pending.
    refetchInterval: (q) => (q.state.data?.white?.pending || q.state.data?.black?.pending ? 4000 : false),
  });
  const reps = all.data ?? [];

  if (all.isLoading) return <p>Loading…</p>;
  if (!reps.length) return <p className="muted">No repertoire yet.</p>;

  // Selection: a colour (all its holes) or one repertoire (its own holes).
  const sel = params.get('r');
  const selectedRep = reps.find((r) => r.id === sel);
  const selectedColor: Color =
    selectedRep?.color ?? (COLORS.includes(sel as Color) ? (sel as Color) : COLORS.find((c) => reps.some((r) => r.color === c))!);
  const report = gaps.data?.[selectedColor];
  const shownGaps = (selectedRep ? report?.gaps.filter((g) => g.repertoireId === selectedRep.id) : report?.gaps) ?? [];
  const names = new Map(reps.map((r) => [r.id, r.name]));
  const select = (r: string) => setParams({ r }, { replace: true });

  return (
    <div className="gaps">
      <header className="row">
        <h2>Gaps</h2>
        <label className="muted">
          holes: opponent moves played in at least{' '}
          <select
            value={cutoff}
            onChange={(e) => {
              localStorage.setItem('gapCutoff', e.target.value);
              setCutoff(Number(e.target.value));
            }}
          >
            {CUTOFFS.map((c) => (
              <option key={c} value={c}>{pct(c)}</option>
            ))}
          </select>{' '}
          of games
        </label>
      </header>
      <p className="muted small-text">
        <strong>Preparation depth</strong>: how many moves a game stays in your lines on average, until
        the opponent plays a move you have not prepared or your line ends, using how often each move is
        played on Lichess ({ex.speeds.join('+')}). When you have several answers in a position, each
        counts for an equal share of the games.
      </p>
      <p className="muted small-text">
        Your repertoires of one colour are analysed together: a line prepared in one of them is not a
        hole in the others. Each game is counted in the repertoire where its preparation ends, the one
        following its line the furthest, but only after that repertoire's first choice: 1... e6 is not
        part of a Scotch repertoire (1. e4 e5 2. Nf3 Nc6 3. d4…), it is another opening.
      </p>
      <RatingRange current={ex.ratings} />
      {gaps.isLoading && <p className="muted">Analysing…</p>}
      {gaps.error && <p className="error">{String(gaps.error)}</p>}

      {gaps.data && (
        <section className="panel">
          <h3>Preparation depth</h3>
          <table className="lines">
            <thead>
              <tr>
                <th />
                <th title="Share of the games whose preparation ends in this repertoire">Games</th>
                <th title="Average number of moves these games stay in your preparation">Average depth</th>
                <th title={`Unprepared moves played in at least ${pct(cutoff)} of games`}>Holes</th>
                <th />
              </tr>
            </thead>
            {COLORS.map((color) => {
              const r = gaps.data[color];
              if (!r) return null;
              const byId = new Map(r.repertoires.map((x) => [x.id, x]));
              const rows = reps.filter((rep) => rep.color === color).sort((a, b) => (byId.get(b.id)?.share ?? 0) - (byId.get(a.id)?.share ?? 0));
              return (
                <tbody key={color}>
                  <tr className={`color-row clickable ${!selectedRep && selectedColor === color ? 'selected' : ''}`} onClick={() => select(color)}>
                    <td>
                      <span className={`dot inline ${color}`} /> <strong>All {color} games</strong>
                    </td>
                    <td>100%</td>
                    <td>
                      <strong>{moves(r.depth, r.unknown)}</strong>
                    </td>
                    <td>{r.gaps.length}</td>
                    <td className="muted small-text">{status(r)}</td>
                  </tr>
                  {rows.map((rep) => {
                    const x = byId.get(rep.id);
                    const own = r.gaps.filter((g) => g.repertoireId === rep.id);
                    return (
                      <tr key={rep.id} className={`clickable ${rep.id === selectedRep?.id ? 'selected' : ''}`} onClick={() => select(rep.id)}>
                        <td className="indent">{rep.name}</td>
                        <td>{x?.share ? pct(x.share) : '—'}</td>
                        <td>{x?.share ? moves(x.depth) : ''}</td>
                        <td>{own.length ? `${own.length} · ${pct(own.reduce((n, g) => n + g.prob, 0))} of games` : '0'}</td>
                        <td />
                      </tr>
                    );
                  })}
                  {r.unowned.share >= 0.001 && (
                    <tr>
                      <td className="indent muted">in no repertoire (other openings)</td>
                      <td>{pct(r.unowned.share)}</td>
                      <td>{moves(r.unowned.depth)}</td>
                      <td />
                      <td />
                    </tr>
                  )}
                </tbody>
              );
            })}
          </table>
          {COLORS.some((c) => (gaps.data[c]?.unknown ?? 0) >= 0.01) && (
            <p className="muted small-text">
              ≥: some games reach positions without Lichess statistics
              {COLORS.filter((c) => (gaps.data[c]?.unknown ?? 0) >= 0.01)
                .map((c) => ` (${c}: ${pct(gaps.data[c]!.unknown)} of games)`)
                .join(',')}
              ; they are counted up to there, so the depth is a minimum.
              {!gaps.data.live && ' Connect Lichess in Settings to fetch them.'}
            </p>
          )}
        </section>
      )}

      {report && (
        <section className="panel">
          <h3>Holes · {selectedRep ? selectedRep.name : `all ${selectedColor} games`}</h3>
          {shownGaps.length === 0 ? (
            <p className="muted">No hole of {pct(cutoff)} or more{selectedRep ? ' in this repertoire' : ''}.</p>
          ) : (
            <table className="lines">
              <thead>
                <tr>
                  <th className="prob">Games</th>
                  <th>Line</th>
                  {!selectedRep && <th>Repertoire</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {shownGaps.map((g) => (
                  <HoleRow
                    key={`${g.kind}|${g.fen}|${g.move?.uci ?? ''}`}
                    gap={g}
                    owner={selectedRep ? undefined : g.repertoireId ? names.get(g.repertoireId) ?? '' : null}
                    choices={reps.filter((r) => r.color === selectedColor)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * `owner`: repertoire name column (null: no repertoire; undefined: no column). `choices`: the
 * repertoires of that colour, any of which can take the hole, in the server's ranking order.
 */
function HoleRow({ gap, owner, choices }: { gap: Gap; owner?: string | null; choices: RepertoireSummary[] }) {
  const navigate = useNavigate();
  const line = gap.move ? [...gap.ucis, gap.move.uci] : gap.ucis;
  const rank = new Map(gap.ranking.map((id, i) => [id, i]));
  const sorted = [...choices].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  return (
    <tr>
      <td className="prob">{pct(gap.prob)}</td>
      <td>
        <span className="muted">{lineText(gap.line) || 'Initial position'} </span>
        <span className="hole-move">{gap.move ? nextMove(gap.line, gap.move.san) : 'no answer prepared'}</span>
      </td>
      {owner !== undefined && (
        <td>{owner ?? <span className="muted" title="Played before the first choice of each of your repertoires: another opening">none (another opening)</span>}</td>
      )}
      <td>
        <select
          className="small-text"
          value=""
          aria-label="Prepare this line in a repertoire"
          onChange={(e) => navigate(`/r/${e.target.value}?${new URLSearchParams({ line: line.join(',') })}`)}
        >
          <option value="" disabled>prepare in…</option>
          {sorted.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.id === gap.repertoireId ? ' (suggested)' : ''}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}
