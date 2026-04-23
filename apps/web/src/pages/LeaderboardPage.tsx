import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { apiFetch } from "../api/client";
import { useAuth } from "../auth/AuthContext";

type Row = {
  rank: number;
  userId: string;
  email: string;
  grossScore: number;
  netScore: number | null;
  playedDate: string;
};

export function LeaderboardPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [period, setPeriod] = useState<"all" | "week" | "season">("all");
  const [playedDate, setPlayedDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [gross, setGross] = useState(90);
  const [net, setNet] = useState<number | "">("");

  const q = useQuery({
    queryKey: ["leaderboard", period],
    queryFn: async () => {
      const res = await apiFetch(`/leaderboard?period=${period}`);
      if (!res.ok) throw new Error("Failed to load leaderboard");
      return (await res.json()) as { leaderboard: Row[] };
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/scores", {
        method: "POST",
        body: JSON.stringify({
          playedDate,
          grossScore: gross,
          ...(net === "" ? {} : { netScore: net }),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Submit failed");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });

  function onSubmitScore(e: FormEvent) {
    e.preventDefault();
    submit.mutate();
  }

  return (
    <div className="stack">
      <header className="page-head">
        <p className="page-head__eyebrow">Clubhouse</p>
        <h1 className="page-head__title">Leaderboard</h1>
        <p className="page-head__lede">
          Gross and net scores by period. Sign in to post a round.
        </p>
      </header>

      <div className="row" style={{ marginTop: "-0.5rem" }}>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <span className="muted" style={{ fontWeight: 600 }}>
            Period
          </span>
          <select
            value={period}
            onChange={(e) =>
              setPeriod(e.target.value as "all" | "week" | "season")
            }
          >
            <option value="all">All time</option>
            <option value="week">Last 7 days</option>
            <option value="season">Season (from Mar 1)</option>
          </select>
        </label>
      </div>

      <div className="lb-split">
        <div className="lb-split__main">
          {q.isLoading ?
            <div className="stack" style={{ alignItems: "center", padding: "2rem" }}>
              <div className="loading-line" />
              <p className="muted">Loading…</p>
            </div>
          : q.isError ?
            <p className="error">Could not load leaderboard.</p>
          : <div className="card card--flush">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Player</th>
                      <th>Gross</th>
                      <th>Net</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(q.data?.leaderboard ?? []).map((r) => (
                      <tr key={`${r.userId}-${r.playedDate}-${r.rank}`}>
                        <td>
                          <strong>{r.rank}</strong>
                        </td>
                        <td>{r.email}</td>
                        <td>{r.grossScore}</td>
                        <td>{r.netScore ?? "—"}</td>
                        <td>{r.playedDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          }
        </div>

        {user ?
          <div className="card stack lb-split__aside">
            <h3>Submit a score</h3>
            <form className="stack" onSubmit={(e) => void onSubmitScore(e)}>
              <label>
                Round date
                <input
                  type="date"
                  value={playedDate}
                  onChange={(e) => setPlayedDate(e.target.value)}
                  required
                />
              </label>
              <label>
                Gross score
                <input
                  type="number"
                  min={18}
                  max={200}
                  value={gross}
                  onChange={(e) => setGross(Number(e.target.value))}
                  required
                />
              </label>
              <label>
                Net score (optional)
                <input
                  type="number"
                  min={18}
                  max={200}
                  value={net}
                  onChange={(e) =>
                    setNet(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
              </label>
              {submit.isError ?
                <p className="error">
                  {submit.error instanceof Error ?
                    submit.error.message
                  : "Error"}
                </p>
              : null}
              <button type="submit" disabled={submit.isPending}>
                {submit.isPending ? "Saving…" : "Save score"}
              </button>
            </form>
          </div>
        : <div className="card lb-split__aside">
            <p className="muted" style={{ margin: 0 }}>
              <strong style={{ color: "var(--brand-navy)" }}>Sign in</strong> to submit
              scores and see your rounds on the board.
            </p>
          </div>
        }
      </div>
    </div>
  );
}
