"use client";

export default function ArticleError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="max-w-3xl mx-auto px-4 py-20 text-center">
      <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>
      <p className="text-muted-foreground mb-6">
        This article could not be loaded. It may have been removed or contains
        invalid content.
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
