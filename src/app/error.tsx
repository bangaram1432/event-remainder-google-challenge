"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="shell" id="main">
      <h1>Something went wrong</h1>
      <p>The page hit an unexpected problem. Your details were not saved anywhere.</p>
      <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
    </main>
  );
}
