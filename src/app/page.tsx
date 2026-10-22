import { PlannerApp } from "@/components/PlannerApp";

export default function HomePage() {
  return (
    <main id="main" className="shell" tabIndex={-1}>
      <header className="hero">
        <p className="eyebrow">Jubilee · celebration planner</p>
        <h1>Plan the celebration, not the spreadsheet.</h1>
        <p className="lede">
          Tell us about your wedding, birthday or community event. Get a budget that adds up, a dated timeline,
          vendor checklists and ideas shaped around you.
        </p>
      </header>
      <section className="card scope" aria-labelledby="scope-heading">
        <h2 id="scope-heading">What Jubilee does, and what it doesn’t</h2>
        <ul>
          <li>It calculates an exact budget split, a dated timeline and vendor checklists from your answers, and explains each choice.</li>
          <li>AI then adds themes, personal touches and risks from your notes. It never changes the numbers or dates.</li>
          <li>It doesn’t know local prices, book vendors or replace a written quote. Treat figures as planning guides.</li>
        </ul>
      </section>
      <PlannerApp />
      <footer className="site-footer">
        <p>
          Your notes are used once to personalise ideas and are never stored. Budget and dates are calculated by
          transparent rules; AI only adds ideas and wording.
        </p>
      </footer>
    </main>
  );
}
