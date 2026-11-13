import type { Color } from '@prepa-cahier/core';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Gap, type GapReport, type Me, type RepertoireSummary } from '../api';
import { lineText } from '../chessText';
import { StatsSource } from '../components/StatsSource';
import { explorerParams, useSettings } from '../settings';
import { EmptyState, plural } from '../ui';

const COLORS: Color[] = ['white', 'black'];
const COLOR_NAME = { white: 'Blancs', black: 'Noirs' } as const;

const pct = (x: number) => (x > 0 && x < 0.01 ? `${(100 * x).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : `${Math.round(100 * x)} %`);
const fr = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** The move after `line`, numbered when needed: "3. Bb5", "d6" after "2. Nf3", "1... e5" alone. */
function nextMove(line: string[], san: string): string {
  const ply = line.length;
  if (ply % 2 === 0) return `${ply / 2 + 1}. ${san}`;
  return ply > 0 ? san : `1... ${san}`;
}

/** "5,0 coups", "≥ 3,8 coups" when some games reach positions without statistics. */
const moves = (n: number, unknown = 0) => `${unknown >= 0.01 ? '≥ ' : ''}${fr(n)} coups`;

function status(r: GapReport): string {
  if (r.pending > 0) return `récupération des statistiques de ${plural(r.pending, 'position', 'positions')}…`;
  const notes: string[] = [];
  if (r.missing > 0) notes.push(`${plural(r.missing, 'position', 'positions')} sans statistiques`);
  if (r.approximate > 0) notes.push(`${r.approximate} avec les statistiques d’une autre tranche`);
  if (r.truncated) notes.push('répertoire trop grand, analyse partielle');
  return notes.join(' · ');
}

/** Bilan › Trous: preparation depth per colour and repertoire, and the holes. */
export function Gaps({ me }: { me: Me }) {
  const { speed, range, gapCutoff: cutoff } = useSettings();
  const ex = explorerParams(me, speed, range);
  const [params, setParams] = useSearchParams();
  const all = useQuery({ queryKey: ['repertoires'], queryFn: api.repertoires });
  const gaps = useQuery({
    queryKey: ['gaps', ex.speeds, ex.ratings, cutoff],
    queryFn: () => api.gaps(ex.speeds, ex.ratings, cutoff),
    // Statistics are fetched in the background: ask again until nothing is pending.
    refetchInterval: (q) => (q.state.data?.white?.pending || q.state.data?.black?.pending ? 4000 : false),
  });
  const reps = all.data ?? [];

  if (all.isLoading) return <p className="muted">Chargement…</p>;
  if (!reps.length) return <EmptyState title="Aucun répertoire" />;

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
    <div className="stack">
      <div className="row">
        <StatsSource me={me} />
      </div>
      <p className="muted small-text">
        <strong>Profondeur de préparation</strong> : combien de coups une partie reste en moyenne dans vos lignes, jusqu’à ce que
        l’adversaire joue un coup non préparé ou que votre ligne s’arrête. Vos répertoires d’une même couleur sont analysés
        ensemble : une ligne préparée dans l’un n’est pas un trou dans l’autre.
      </p>
      {gaps.isLoading && <p className="muted">Calcul…</p>}
      {gaps.error && <p className="error">{String(gaps.error)}</p>}

      {gaps.data && (
        <section className="card">
          <h3>Profondeur de préparation</h3>
          <div className="table-wrap">
            <table className="lines">
              <thead>
                <tr>
                  <th />
                  <th title="Part des parties dont la préparation se termine dans ce répertoire">Parties</th>
                  <th title="Nombre moyen de coups joués dans votre préparation">Profondeur</th>
                  <th title={`Coups non préparés joués dans au moins ${pct(cutoff)} des parties`}>Trous</th>
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
                        <span className={`dot ${color}`} /> <strong>{COLOR_NAME[color]}</strong>
                      </td>
                      <td>100 %</td>
                      <td><strong>{moves(r.depth, r.unknown)}</strong></td>
                      <td>{r.gaps.length}</td>
                    </tr>
                    {rows.map((rep) => {
                      const x = byId.get(rep.id);
                      const own = r.gaps.filter((g) => g.repertoireId === rep.id);
                      return (
                        <tr key={rep.id} className={`clickable ${rep.id === selectedRep?.id ? 'selected' : ''}`} onClick={() => select(rep.id)}>
                          <td className="indent">{rep.name}</td>
                          <td>{x?.share ? pct(x.share) : '—'}</td>
                          <td>{x?.share ? moves(x.depth) : ''}</td>
                          <td>{own.length || ''}</td>
                        </tr>
                      );
                    })}
                    {status(r) && (
                      <tr>
                        <td colSpan={4} className="muted small-text">{status(r)}</td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>
          {COLORS.some((c) => (gaps.data[c]?.unknown ?? 0) >= 0.01) && (
            <p className="muted small-text">
              ≥ : certaines parties atteignent des positions sans statistiques Lichess ; elles sont comptées jusque-là, la profondeur est
              donc un minimum.{!gaps.data.live && ' Liez Lichess dans les paramètres pour les récupérer.'}
            </p>
          )}
        </section>
      )}

      {report && (
        <section className="card">
          <h3>Trous · {selectedRep ? selectedRep.name : COLOR_NAME[selectedColor]}</h3>
          {shownGaps.length === 0 ? (
            <p className="muted">Aucun trou de {pct(cutoff)} ou plus{selectedRep ? ' dans ce répertoire' : ''}.</p>
          ) : (
            <div className="table-wrap">
              <table className="lines">
                <thead>
                  <tr>
                    <th className="prob">Parties</th>
                    <th>Ligne</th>
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
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * `owner`: repertoire shown under the line (null: none; undefined: not shown). `choices`: the
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
        <span className="muted">{lineText(gap.line) || 'Position initiale'} </span>
        <span className="hole-move">{gap.move ? nextMove(gap.line, gap.move.san) : 'aucune réponse préparée'}</span>
        {owner !== undefined && <div className="muted small-text" style={{ margin: 0 }}>{owner ?? 'aucun répertoire (autre ouverture)'}</div>}
      </td>
      <td>
        <select
          value=""
          aria-label="Préparer cette ligne dans un répertoire"
          onChange={(e) => navigate(`/r/${e.target.value}?${new URLSearchParams({ line: line.join(',') })}`)}
        >
          <option value="" disabled>Préparer dans…</option>
          {sorted.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.id === gap.repertoireId ? ' (conseillé)' : ''}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}
