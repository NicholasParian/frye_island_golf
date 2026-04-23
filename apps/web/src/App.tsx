import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { CalendarPage } from "./pages/CalendarPage";
import { CheckoutCancelPage, CheckoutReturnPage } from "./pages/CheckoutPages";
import { HomePage } from "./pages/HomePage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { LoginPage } from "./pages/LoginPage";
import { MyBookingsPage } from "./pages/MyBookingsPage";
import { RegisterPage } from "./pages/RegisterPage";
import { AdminPage } from "./pages/AdminPage";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="stack" style={{ padding: "3rem 0", alignItems: "center" }}>
        <div className="loading-line" />
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="stack" style={{ padding: "3rem 0", alignItems: "center" }}>
        <div className="loading-line" />
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "ADMIN") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!navOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setNavOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) return;
    const narrow = window.matchMedia("(max-width: 768px)");
    if (!narrow.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 769px)");
    function onWide() {
      if (mq.matches) setNavOpen(false);
    }
    mq.addEventListener("change", onWide);
    return () => mq.removeEventListener("change", onWide);
  }, []);

  function closeNav() {
    setNavOpen(false);
  }

  return (
    <div className="layout">
      <header className="layout-header">
        <div className="layout-header-inner">
          <NavLink to="/" className="brand" end onClick={closeNav}>
            <img
              src={`${import.meta.env.BASE_URL}frye-island-golf-club-logo.png`}
              alt="Frye Island Golf Club"
              className="brand-logo"
              width={200}
              height={64}
              decoding="async"
            />
            <span className="sr-only">Frye Island Golf Club</span>
          </NavLink>
          <button
            type="button"
            className="nav-menu-toggle"
            aria-expanded={navOpen}
            aria-controls="site-nav"
            onClick={() => setNavOpen((o) => !o)}
          >
            <span className="sr-only">{navOpen ? "Close menu" : "Open menu"}</span>
            <span className="nav-menu-toggle-bars" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </button>
          <nav
            id="site-nav"
            className={navOpen ? "nav-primary nav-primary--open" : "nav-primary"}
            aria-label="Main"
          >
            <NavLink
              to="/"
              className={({ isActive }) => (isActive ? "active" : "")}
              end
              onClick={closeNav}
            >
              Home
            </NavLink>
            <NavLink
              to="/calendar"
              className={({ isActive }) => (isActive ? "active" : "")}
              onClick={closeNav}
            >
              Tee times
            </NavLink>
            <NavLink
              to="/my-bookings"
              className={({ isActive }) => (isActive ? "active" : "")}
              onClick={closeNav}
            >
              My bookings
            </NavLink>
            <NavLink
              to="/leaderboard"
              className={({ isActive }) => (isActive ? "active" : "")}
              onClick={closeNav}
            >
              Leaderboard
            </NavLink>
            {user?.role === "ADMIN" ?
              <NavLink
                to="/admin"
                className={({ isActive }) => (isActive ? "active" : "")}
                onClick={closeNav}
              >
                Admin
              </NavLink>
            : null}
            {user ?
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  closeNav();
                  void logout();
                }}
              >
                Sign out
              </button>
            : <>
                <NavLink to="/login" onClick={closeNav}>
                  Sign in
                </NavLink>
                <NavLink to="/register" onClick={closeNav}>
                  Register
                </NavLink>
              </>
            }
          </nav>
        </div>
      </header>

      <main className="layout-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route
            path="/calendar"
            element={
              <Protected>
                <CalendarPage />
              </Protected>
            }
          />
          <Route
            path="/my-bookings"
            element={
              <Protected>
                <MyBookingsPage />
              </Protected>
            }
          />
          <Route path="/checkout/return" element={<CheckoutReturnPage />} />
          <Route path="/checkout/cancel" element={<CheckoutCancelPage />} />
          <Route
            path="/admin"
            element={
              <AdminOnly>
                <AdminPage />
              </AdminOnly>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="layout-footer">
        <div className="layout-footer-inner">
          <span>Frye Island Golf Club · Tee time booking</span>
          <span>
            <a href="https://www.fryeislandgolf.com/" target="_blank" rel="noopener noreferrer">
              fryeislandgolf.com
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
