import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
import {
  MAX_PARTY_SIZE,
  MIN_PARTY_SIZE,
  RIDERS_PER_CART,
} from "@fig/shared";

type BookingRow = {
  id: string;
  status: string;
  partySize: number;
  cartCount: number;
  amountCents: number | null;
  startsAt: string;
  teeSlotId: string;
  players: { id: string; displayName: string }[];
  payment: { status: string; amountCents: number } | null;
};

function statusClass(status: string): string {
  if (status === "CONFIRMED") return "status-pill status-pill--ok";
  if (status === "PENDING_PAYMENT") return "status-pill status-pill--pending";
  return "status-pill status-pill--muted";
}

function BookingCard(props: { b: BookingRow }) {
  const { b } = props;
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [partySize, setPartySize] = useState(b.partySize);
  const [cartCount, setCartCount] = useState(b.cartCount);
  const [refund, setRefund] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const paidLocked =
    b.status === "CONFIRMED" && b.payment?.status === "SUCCEEDED";

  const updateMut = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/bookings/${b.id}`, {
        method: "PATCH",
        body: JSON.stringify({ partySize, cartCount }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Update failed");
      }
    },
    onSuccess: () => {
      setEditing(false);
      setErr(null);
      void qc.invalidateQueries({ queryKey: ["my-bookings"] });
      void qc.invalidateQueries({ queryKey: ["slots"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/bookings/${b.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ refund }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Cancel failed");
      }
    },
    onSuccess: () => {
      setErr(null);
      void qc.invalidateQueries({ queryKey: ["my-bookings"] });
      void qc.invalidateQueries({ queryKey: ["slots"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const maxCarts = Math.ceil(partySize / RIDERS_PER_CART);
  const isCancelled = b.status === "CANCELLED";
  const canRescheduleOrEditParty = b.status === "CONFIRMED" && !isCancelled;
  const canEditPartyCarts = canRescheduleOrEditParty && !paidLocked;

  return (
    <div className="card stack booking-me-card">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <strong>{new Date(b.startsAt).toLocaleString()}</strong>
        <span className={statusClass(b.status)}>{b.status}</span>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Party {b.partySize} · {b.cartCount} cart(s)
        {b.payment ?
          <> · Payment {b.payment.status}</>
        : null}
      </p>
      <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
        {b.players.map((p) => p.displayName).join(", ") || "—"}
      </p>

      {paidLocked ?
        <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
          Payment received — you can reschedule to another tee time. To change party size or
          carts, contact the clubhouse.
        </p>
      : null}

      {err ? <p className="error">{err}</p> : null}

      {isCancelled ?
        null
      : editing && canEditPartyCarts ?
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            updateMut.mutate();
          }}
        >
          <label>
            Party size ({MIN_PARTY_SIZE}–{MAX_PARTY_SIZE})
            <input
              type="number"
              min={MIN_PARTY_SIZE}
              max={MAX_PARTY_SIZE}
              value={partySize}
              onChange={(e) => {
                const n = Number(e.target.value);
                setPartySize(n);
                setCartCount((c) => Math.min(c, Math.ceil(n / RIDERS_PER_CART)));
              }}
              required
            />
          </label>
          <label>
            Golf carts (0–{maxCarts})
            <input
              type="number"
              min={0}
              max={maxCarts}
              value={cartCount}
              onChange={(e) => setCartCount(Number(e.target.value))}
              required
            />
          </label>
          <div className="row">
            <button type="submit" disabled={updateMut.isPending}>
              {updateMut.isPending ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEditing(false);
                setPartySize(b.partySize);
                setCartCount(b.cartCount);
                setErr(null);
              }}
            >
              Done
            </button>
          </div>
        </form>
      : (
        <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          {canEditPartyCarts ?
            <button type="button" className="secondary" onClick={() => setEditing(true)}>
              Edit party / carts
            </button>
          : null}
          {canRescheduleOrEditParty ?
            <Link
              to={`/calendar?reschedule=${encodeURIComponent(b.id)}`}
              className="btn btn-secondary"
            >
              Move to another time
            </Link>
          : null}
          {!isCancelled ?
            <>
              {b.payment?.status === "SUCCEEDED" ?
                <label
                  className="muted"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    fontSize: "0.88rem",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={refund}
                    onChange={(e) => setRefund(e.target.checked)}
                  />
                  Refund when cancelling
                </label>
              : null}
              <button
                type="button"
                className="danger"
                disabled={cancelMut.isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      refund ?
                        "Cancel this booking and request a refund?"
                      : "Cancel this booking?",
                    )
                  ) {
                    return;
                  }
                  cancelMut.mutate();
                }}
              >
                {cancelMut.isPending ? "Cancelling…" : "Cancel booking"}
              </button>
            </>
          : null}
        </div>
      )}
    </div>
  );
}

export function MyBookingsPage() {
  const q = useQuery({
    queryKey: ["my-bookings"],
    queryFn: async () => {
      const res = await apiFetch("/bookings/me");
      if (!res.ok) throw new Error("Failed to load bookings");
      return (await res.json()) as { bookings: BookingRow[] };
    },
  });

  if (q.isLoading) {
    return (
      <div className="stack" style={{ alignItems: "center", padding: "3rem 0" }}>
        <div className="loading-line" />
        <p className="muted">Loading bookings…</p>
      </div>
    );
  }
  if (q.isError) return <p className="error">Could not load bookings.</p>;

  const rows = q.data?.bookings ?? [];

  return (
    <div className="stack">
      <header className="page-head">
        <p className="page-head__eyebrow">Your schedule</p>
        <h1 className="page-head__title">My bookings</h1>
        <p className="page-head__lede">
          Update party size or carts, move your tee time, or cancel. Pending checkout must be
          finished or cancelled before other changes.
        </p>
      </header>

      {rows.length === 0 ?
        <div className="card empty-state">
          <strong>No bookings yet</strong>
          When you reserve a tee time, it will appear here.
        </div>
      : <div className="stack" style={{ gap: "1rem" }}>
          {rows.map((b) => (
            <BookingCard key={b.id} b={b} />
          ))}
        </div>
      }
    </div>
  );
}
