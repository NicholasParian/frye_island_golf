import { Link, useSearchParams } from "react-router-dom";

export function CheckoutReturnPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  return (
    <div className="card stack checkout-card">
      <header className="page-head" style={{ marginBottom: 0 }}>
        <p className="page-head__eyebrow">Payment</p>
        <h2 className="page-head__title">Payment complete</h2>
      </header>
      <p className="muted">
        {sessionId ?
          "Thank you — your tee time is being confirmed. You will see it under My bookings once the payment webhook finishes processing."
        : "Thank you — you can review your bookings anytime."}
      </p>
      <Link to="/my-bookings" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
        View my bookings
      </Link>
    </div>
  );
}

export function CheckoutCancelPage() {
  const [params] = useSearchParams();
  const bookingId = params.get("bookingId");
  return (
    <div className="card stack checkout-card">
      <header className="page-head" style={{ marginBottom: 0 }}>
        <p className="page-head__eyebrow">Checkout</p>
        <h2 className="page-head__title">Checkout cancelled</h2>
      </header>
      <p className="muted">
        No charge was completed
        {bookingId ? ` for booking ${bookingId}` : ""}. You can pick another time from
        the tee sheet.
      </p>
      <Link to="/calendar" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
        Back to calendar
      </Link>
    </div>
  );
}
