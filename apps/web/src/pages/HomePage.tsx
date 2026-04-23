import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function HomePage() {
  const { user } = useAuth();
  return (
    <div className="stack">
      <section className="hero stack">
        <img
          src={`${import.meta.env.BASE_URL}frye-island-golf-club-logo.png`}
          alt=""
          className="home-hero-logo"
          width={340}
          height={112}
          decoding="async"
          aria-hidden
        />
        <p className="home-tagline">Sebago Lake&apos;s island course</p>
        <h1>Tee time booking</h1>
        <p className="muted">
          Reserve tee times, add cart rentals when available, and post scores to the
          clubhouse leaderboard. Members skip the public green fee; guests complete
          checkout online.
        </p>
        <div className="hero-actions">
          {user ?
            <>
              <Link to="/calendar" className="btn btn-primary">
                View tee sheet
              </Link>
              <Link to="/my-bookings" className="btn btn-secondary">
                My bookings
              </Link>
            </>
          : <>
              <Link to="/register" className="btn btn-primary">
                Create account
              </Link>
              <Link to="/login" className="btn btn-secondary">
                Sign in
              </Link>
            </>
          }
        </div>
      </section>

      <div className="feature-grid">
        <div className="feature-tile">
          <div className="feature-tile__mark" aria-hidden />
          <h3>Book your round</h3>
          <p>
            Pick an open slot, set party size and carts, and confirm in seconds — or
            finish checkout as a guest.
          </p>
        </div>
        <div className="feature-tile">
          <div className="feature-tile__mark" aria-hidden />
          <h3>Carts &amp; inventory</h3>
          <p>
            Cart counts follow daily inventory. Two riders per cart, up to four players
            per tee time.
          </p>
        </div>
        <div className="feature-tile">
          <div className="feature-tile__mark" aria-hidden />
          <h3>Leaderboard</h3>
          <p>Share scores after your round and see how you stack up for the week or season.</p>
        </div>
      </div>

      <p className="muted" style={{ textAlign: "center", marginTop: "0.5rem" }}>
        Course info, rates, and the clubhouse:{" "}
        <a href="https://www.fryeislandgolf.com/" target="_blank" rel="noopener noreferrer">
          fryeislandgolf.com
        </a>
      </p>
    </div>
  );
}
