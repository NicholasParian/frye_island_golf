import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { MAX_PARTY_SIZE, MIN_PARTY_SIZE, RIDERS_PER_CART } from "@fig/shared";
import { apiFetch } from "../api/client";

type CourseDay = {
  id: string;
  date: string;
  intervalMinutes: number;
  firstTeeTime: string;
  lastTeeTime: string;
  totalCarts: number;
  allowPublicBooking: boolean;
  timezone: string;
};

type UserRow = { id: string; email: string; role: string };

type AdminBooking = {
  id: string;
  status: string;
  partySize: number;
  cartCount: number;
  startsAt: string;
  teeSlotId: string;
  user: { id: string; email: string; role: string };
};

function rangeDefaults() {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 14);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function AdminPage() {
  const qc = useQueryClient();
  const [{ from, to }, setRange] = useState(rangeDefaults);

  const [tab, setTab] = useState<"day" | "users" | "bookings">("day");

  const [dayForm, setDayForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    intervalMinutes: 8,
    firstTeeTime: "07:00",
    lastTeeTime: "17:00",
    totalCarts: 20,
    allowPublicBooking: true,
    timezone: "America/New_York",
  });

  const courseDays = useQuery({
    queryKey: ["admin-course-days", from, to],
    queryFn: async () => {
      const res = await apiFetch(`/admin/course-days?from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Failed to load course days");
      return (await res.json()) as { courseDays: CourseDay[] };
    },
    enabled: tab === "day",
  });

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await apiFetch("/admin/users");
      if (!res.ok) throw new Error("Failed to load users");
      return (await res.json()) as { users: UserRow[] };
    },
    enabled: tab === "users",
  });

  const bookings = useQuery({
    queryKey: ["admin-bookings", from, to],
    queryFn: async () => {
      const res = await apiFetch(`/admin/bookings?from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Failed to load bookings");
      return (await res.json()) as { bookings: AdminBooking[] };
    },
    enabled: tab === "bookings",
  });

  const saveDay = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/admin/course-days", {
        method: "PUT",
        body: JSON.stringify(dayForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === "string" ? body.error : "Save failed",
        );
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-course-days"] });
      void qc.invalidateQueries({ queryKey: ["slots"] });
    },
  });

  const rebuild = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/admin/course-days/${id}/rebuild-slots`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Rebuild failed");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-course-days"] });
      void qc.invalidateQueries({ queryKey: ["slots"] });
    },
  });

  const updateRole = useMutation({
    mutationFn: async (params: { userId: string; role: string }) => {
      const res = await apiFetch(`/admin/users/${params.userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: params.role }),
      });
      if (!res.ok) throw new Error("Update failed");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const cancelBooking = useMutation({
    mutationFn: async (params: { id: string; refund: boolean }) => {
      const res = await apiFetch(`/admin/bookings/${params.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ refund: params.refund }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === "string" ? body.error : "Cancel failed",
        );
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-bookings"] });
      void qc.invalidateQueries({ queryKey: ["slots"] });
    },
  });

  const moveBooking = useMutation({
    mutationFn: async (params: { id: string; newTeeSlotId: string }) => {
      const res = await apiFetch(`/admin/bookings/${params.id}/move`, {
        method: "PATCH",
        body: JSON.stringify({ newTeeSlotId: params.newTeeSlotId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === "string" ? body.error : "Move failed",
        );
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-bookings"] });
      void qc.invalidateQueries({ queryKey: ["slots"] });
    },
  });

  const patchBooking = useMutation({
    mutationFn: async (params: {
      id: string;
      partySize: number;
      cartCount: number;
    }) => {
      const res = await apiFetch(`/admin/bookings/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          partySize: params.partySize,
          cartCount: params.cartCount,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === "string" ? body.error : "Update failed",
        );
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-bookings"] });
      void qc.invalidateQueries({ queryKey: ["slots"] });
    },
  });

  const tabs = useMemo(
    () =>
      [
        { id: "day" as const, label: "Course days" },
        { id: "users" as const, label: "Users" },
        { id: "bookings" as const, label: "Bookings" },
      ] as const,
    [],
  );

  function onSaveDay(e: FormEvent) {
    e.preventDefault();
    saveDay.mutate();
  }

  return (
    <div className="stack">
      <header className="page-head">
        <p className="page-head__eyebrow">Staff</p>
        <h1 className="page-head__title">Administration</h1>
        <p className="page-head__lede">
          Course days, users, and booking operations for the tee sheet.
        </p>
      </header>

      <div className="tab-bar" role="tablist" aria-label="Admin sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "tab tab-active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="row">
        <label>
          Range from
          <input
            type="date"
            value={from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
          />
        </label>
        <label>
          Range to
          <input
            type="date"
            value={to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
          />
        </label>
      </div>

      {tab === "day" ?
        <div className="stack">
          <div className="card stack">
            <h3>Configure a day</h3>
            <form className="stack" onSubmit={(e) => void onSaveDay(e)}>
              <label>
                Date
                <input
                  type="date"
                  value={dayForm.date}
                  onChange={(e) =>
                    setDayForm((f) => ({ ...f, date: e.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Interval (minutes)
                <input
                  type="number"
                  min={4}
                  max={30}
                  value={dayForm.intervalMinutes}
                  onChange={(e) =>
                    setDayForm((f) => ({
                      ...f,
                      intervalMinutes: Number(e.target.value),
                    }))
                  }
                  required
                />
              </label>
              <label>
                First tee (HH:MM)
                <input
                  value={dayForm.firstTeeTime}
                  onChange={(e) =>
                    setDayForm((f) => ({ ...f, firstTeeTime: e.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Last tee (HH:MM)
                <input
                  value={dayForm.lastTeeTime}
                  onChange={(e) =>
                    setDayForm((f) => ({ ...f, lastTeeTime: e.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Total carts that day
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={dayForm.totalCarts}
                  onChange={(e) =>
                    setDayForm((f) => ({
                      ...f,
                      totalCarts: Number(e.target.value),
                    }))
                  }
                  required
                />
              </label>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={dayForm.allowPublicBooking}
                  onChange={(e) =>
                    setDayForm((f) => ({
                      ...f,
                      allowPublicBooking: e.target.checked,
                    }))
                  }
                />
                Allow public booking
              </label>
              <label>
                Timezone
                <input
                  value={dayForm.timezone}
                  onChange={(e) =>
                    setDayForm((f) => ({ ...f, timezone: e.target.value }))
                  }
                  required
                />
              </label>
              {saveDay.isError ?
                <p className="error">
                  {saveDay.error instanceof Error ?
                    saveDay.error.message
                  : "Error"}
                </p>
              : null}
              <button type="submit" disabled={saveDay.isPending}>
                {saveDay.isPending ? "Saving…" : "Save & generate slots"}
              </button>
            </form>
          </div>

          <div className="card stack">
            <h3>Configured days in range</h3>
            {courseDays.isLoading ?
              <p className="muted">Loading…</p>
            : courseDays.isError ?
              <p className="error">Could not load.</p>
            : (courseDays.data?.courseDays ?? []).length === 0 ?
              <p className="muted">No course days in this range yet.</p>
            : <div className="card card--flush">
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Interval</th>
                        <th>Window</th>
                        <th>Carts</th>
                        <th>Public</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(courseDays.data?.courseDays ?? []).map((d) => (
                        <tr key={d.id}>
                          <td>{d.date}</td>
                          <td>{d.intervalMinutes}m</td>
                          <td>
                            {d.firstTeeTime}–{d.lastTeeTime}
                          </td>
                          <td>{d.totalCarts}</td>
                          <td>{d.allowPublicBooking ? "yes" : "no"}</td>
                          <td>
                            <button
                              type="button"
                              className="secondary"
                              disabled={rebuild.isPending}
                              onClick={() => rebuild.mutate(d.id)}
                            >
                              Rebuild
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            }
          </div>
        </div>
      : null}

      {tab === "users" ?
        <div className="card card--flush">
          {users.isLoading ?
            <p className="muted" style={{ padding: "1.25rem" }}>
              Loading…
            </p>
          : users.isError ?
            <p className="error" style={{ padding: "1.25rem" }}>
              Could not load users.
            </p>
          : <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(users.data?.users ?? []).map((u) => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td>
                        <select
                          defaultValue={u.role}
                          onChange={(e) =>
                            updateRole.mutate({
                              userId: u.id,
                              role: e.target.value,
                            })
                          }
                        >
                          <option value="PUBLIC">PUBLIC</option>
                          <option value="MEMBER">MEMBER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        </div>
      : null}

      {tab === "bookings" ?
        <div className="card stack">
          {bookings.isLoading ?
            <p className="muted">Loading…</p>
          : bookings.isError ?
            <p className="error">Could not load bookings.</p>
          : (bookings.data?.bookings ?? []).length === 0 ?
            <p className="muted">No bookings in this range.</p>
          : (bookings.data?.bookings ?? []).map((b) => (
              <BookingAdminRow
                key={b.id}
                b={b}
                onCancel={(refund) => cancelBooking.mutate({ id: b.id, refund })}
                onMove={(newTeeSlotId) =>
                  moveBooking.mutate({ id: b.id, newTeeSlotId })
                }
                onSavePartyCarts={(partySize, cartCount) =>
                  patchBooking.mutate({ id: b.id, partySize, cartCount })
                }
                busy={
                  cancelBooking.isPending ||
                  moveBooking.isPending ||
                  patchBooking.isPending
                }
              />
            ))
          }
        </div>
      : null}
    </div>
  );
}

function BookingAdminRow(props: {
  b: AdminBooking;
  onCancel: (refund: boolean) => void;
  onMove: (newTeeSlotId: string) => void;
  onSavePartyCarts: (partySize: number, cartCount: number) => void;
  busy: boolean;
}) {
  const { b, onCancel, onMove, onSavePartyCarts, busy } = props;
  const [moveTo, setMoveTo] = useState("");
  const [refund, setRefund] = useState(false);
  const [partySize, setPartySize] = useState(b.partySize);
  const [cartCount, setCartCount] = useState(b.cartCount);
  const maxCarts = Math.ceil(partySize / RIDERS_PER_CART);

  useEffect(() => {
    setPartySize(b.partySize);
    setCartCount(b.cartCount);
  }, [b.id, b.partySize, b.cartCount]);

  return (
    <div className="stack admin-booking-card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>{new Date(b.startsAt).toLocaleString()}</strong>
        <span className="muted">{b.status}</span>
      </div>
      <div className="muted">
        {b.user.email} ({b.user.role}) · party {b.partySize} · carts{" "}
        {b.cartCount}
      </div>
      <div className="muted">Slot id: {b.teeSlotId}</div>
      {b.status !== "CANCELLED" && b.status !== "PENDING_PAYMENT" ?
        <form
          className="row"
          style={{ alignItems: "flex-end", flexWrap: "wrap", gap: "0.75rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            onSavePartyCarts(partySize, cartCount);
          }}
        >
          <label style={{ minWidth: "7rem" }}>
            Party
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
            />
          </label>
          <label style={{ minWidth: "7rem" }}>
            Carts
            <input
              type="number"
              min={0}
              max={maxCarts}
              value={cartCount}
              onChange={(e) => setCartCount(Number(e.target.value))}
            />
          </label>
          <button type="submit" className="secondary" disabled={busy}>
            Save party / carts
          </button>
        </form>
      : null}
      <div className="row">
        <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={refund}
            onChange={(e) => setRefund(e.target.checked)}
          />
          Refund on cancel (Stripe)
        </label>
        <button
          type="button"
          className="danger"
          disabled={busy || b.status === "CANCELLED"}
          onClick={() => onCancel(refund)}
        >
          Cancel
        </button>
      </div>
      <div className="row">
        <input
          className="admin-move-slot-input"
          placeholder="New tee slot id"
          value={moveTo}
          onChange={(e) => setMoveTo(e.target.value)}
        />
        <button
          type="button"
          className="secondary"
          disabled={busy || !moveTo || b.status === "CANCELLED"}
          onClick={() => onMove(moveTo)}
        >
          Move
        </button>
      </div>
    </div>
  );
}
