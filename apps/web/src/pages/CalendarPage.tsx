import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import {
  CART_FEE_PER_CART_CENTS,
  MAX_PARTY_SIZE,
  MIN_PARTY_SIZE,
  PUBLIC_GREEN_FEE_CENTS,
  RIDERS_PER_CART,
} from "@fig/shared";

type Slot = {
  id: string;
  startsAt: string;
  booked: boolean;
  booking: {
    id: string;
    partySize: number;
    cartCount: number;
    status: string;
    userId: string;
  } | null;
};

function money(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function CalendarPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const rescheduleBookingId = searchParams.get("reschedule");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const fromStr = isoDate(weekStart);
  const toStr = isoDate(addDays(weekStart, 13));

  const slotsQuery = useQuery({
    queryKey: ["slots", fromStr, toStr],
    queryFn: async () => {
      const res = await apiFetch(`/slots?from=${fromStr}&to=${toStr}`);
      if (!res.ok) throw new Error("Failed to load tee times");
      return (await res.json()) as { slots: Slot[] };
    },
  });

  const [selected, setSelected] = useState<Slot | null>(null);
  const [partySize, setPartySize] = useState(2);
  const [cartCount, setCartCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const bookingPanelRef = useRef<HTMLDivElement>(null);

  const rescheduleMut = useMutation({
    mutationFn: async (newTeeSlotId: string) => {
      if (!rescheduleBookingId) throw new Error("Missing booking");
      const res = await apiFetch(`/bookings/${rescheduleBookingId}`, {
        method: "PATCH",
        body: JSON.stringify({ newTeeSlotId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Could not move booking");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["slots"] });
      void qc.invalidateQueries({ queryKey: ["my-bookings"] });
      navigate("/my-bookings", { replace: true });
    },
  });

  useEffect(() => {
    if (rescheduleBookingId) setSelected(null);
  }, [rescheduleBookingId]);

  useEffect(() => {
    if (selected) {
      bookingPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [selected]);

  const byDay = useMemo(() => {
    const slots = slotsQuery.data?.slots ?? [];
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const key = s.startsAt.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
    }
    return map;
  }, [slotsQuery.data]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const isMember = user?.role === "MEMBER" || user?.role === "ADMIN";
  const maxCarts = Math.ceil(partySize / RIDERS_PER_CART);
  const estTotal =
    (isMember ? 0 : PUBLIC_GREEN_FEE_CENTS * partySize) +
    cartCount * CART_FEE_PER_CART_CENTS;

  function openSlot(slot: Slot) {
    if (slot.booked) return;
    if (rescheduleBookingId) {
      setError(null);
      rescheduleMut.mutate(slot.id);
      return;
    }
    setSelected(slot);
    setPartySize(2);
    setCartCount(0);
    setError(null);
  }

  async function onBook(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    setBooking(true);
    try {
      const res = await apiFetch("/bookings", {
        method: "POST",
        body: JSON.stringify({
          teeSlotId: selected.id,
          partySize,
          cartCount,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "Booking failed",
        );
      }
      const checkoutUrl = (body as { checkoutUrl?: string | null }).checkoutUrl;
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }
      setSelected(null);
      await qc.invalidateQueries({ queryKey: ["slots"] });
      await qc.invalidateQueries({ queryKey: ["my-bookings"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setBooking(false);
    }
  }

  return (
    <div className="stack">
      <header className="page-head">
        <p className="page-head__eyebrow">Reserve</p>
        <h1 className="page-head__title">Tee sheet</h1>
        <p className="page-head__lede">
          {rescheduleBookingId ?
            "Choose a new open tee time for your booking. Your party size and carts stay the same."
          : `Browse the week in ${MIN_PARTY_SIZE}–${MAX_PARTY_SIZE} player groups. Carts seat
          up to ${RIDERS_PER_CART} riders (max ${Math.ceil(MAX_PARTY_SIZE / RIDERS_PER_CART)} carts per booking). Tap an
          available time — the booking form opens here.`}
        </p>
      </header>

      {rescheduleBookingId ?
        <div
          className="card stack"
          style={{
            borderColor: "rgba(30, 74, 110, 0.35)",
            background: "linear-gradient(180deg, #f0f7fc 0%, #fff 100%)",
          }}
        >
          <p style={{ margin: 0 }}>
            <strong>Moving your booking</strong> — tap an open slot.{" "}
            {rescheduleMut.isPending ? "Saving…" : null}
          </p>
          {rescheduleMut.isError ?
            <p className="error" style={{ margin: 0 }}>
              {rescheduleMut.error instanceof Error ?
                rescheduleMut.error.message
              : "Could not move booking"}
            </p>
          : null}
          <button
            type="button"
            className="secondary"
            style={{ alignSelf: "flex-start" }}
            disabled={rescheduleMut.isPending}
            onClick={() => navigate("/calendar", { replace: true })}
          >
            Exit without moving
          </button>
        </div>
      : null}

      <div className="week-nav">
        <span className="week-nav__label">Week of {weekStart.toLocaleDateString()}</span>
        <div className="week-nav__actions">
          <button
            type="button"
            className="secondary"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
          >
            Next →
          </button>
        </div>
      </div>

      {selected && !rescheduleBookingId ?
        <div ref={bookingPanelRef} className="card stack booking-panel">
          <h3>Book {new Date(selected.startsAt).toLocaleString()}</h3>
          <form className="stack" onSubmit={(e) => void onBook(e)}>
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
            <p className="muted">
              {isMember ?
                "Members pay cart fees only when renting carts."
              : "Guests pay a green fee per player plus optional cart fees."}{" "}
              <strong>Estimated total: {money(estTotal)}</strong> (actual total
              confirmed at checkout).
            </p>
            {error ? <p className="error">{error}</p> : null}
            <div className="row">
              <button type="submit" disabled={booking}>
                {booking ? "Booking…" : isMember ? "Confirm" : "Continue to checkout"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setSelected(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      : null}

      {slotsQuery.isLoading ?
        <div className="stack" style={{ alignItems: "center", padding: "2rem" }}>
          <div className="loading-line" />
          <p className="muted">Loading tee times…</p>
        </div>
      : slotsQuery.isError ?
        <p className="error">Could not load the tee sheet.</p>
      : <div className="tee-week-grid">
          {weekDays.map((day) => {
            const key = isoDate(day);
            const slots = byDay.get(key) ?? [];
            return (
              <div key={key} className="card stack day-card">
                <h3>
                  {day.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </h3>
                {slots.length === 0 ?
                  <p className="muted" style={{ margin: 0 }}>
                    No tee times configured.
                  </p>
                : <ul className="tee-slot-list">
                    {slots.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className={[
                            "tee-slot-btn",
                            s.booked ? "secondary" : "",
                            selected?.id === s.id ? "tee-slot-btn--active" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          disabled={s.booked || rescheduleMut.isPending}
                          onClick={() => openSlot(s)}
                        >
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>
                            {new Date(s.startsAt).toLocaleTimeString(undefined, {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                          <span style={{ opacity: 0.75 }}>
                            {s.booked ? " · Booked" : " · Open"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                }
              </div>
            );
          })}
        </div>
      }
    </div>
  );
}
