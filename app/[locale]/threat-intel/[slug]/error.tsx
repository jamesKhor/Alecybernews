"use client";

export default function ThreatIntelError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="max-w-3xl mx-auto px-4 py-20 text-center">
      <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>
      <p className="text-muted-foreground mb-6">
        This threat intelligence report could not be loaded.
      </p>
      <button
        onClick={reset}
        className="rounded border border-border px-4 py-2 text-sm hover:bg-secondary transition-colors"
      >
        Try again
      </button>
    </main>
  );
}
