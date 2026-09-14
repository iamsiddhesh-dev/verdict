"use client";

// Replaces the root layout when the layout itself fails, so it carries its own
// html and body and cannot rely on the app's CSS having loaded.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#18181b" }}>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "96px 20px" }}>
          <h1 style={{ fontSize: 28, margin: 0 }}>Verdict hit an error.</h1>
          <p style={{ color: "#52525b", lineHeight: 1.6 }}>Your data is safe. Reload the page, and if it keeps happening, try again in a minute.</p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, height: 40, padding: "0 16px", borderRadius: 8, border: 0, background: "#18181b", color: "#fff", fontSize: 14, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
