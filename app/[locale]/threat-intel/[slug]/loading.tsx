export default function ThreatIntelLoading() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-10">
      <div className="max-w-3xl animate-pulse">
        <div className="h-4 bg-secondary rounded w-24 mb-4" />
        <div className="h-8 bg-secondary rounded w-3/4 mb-3" />
        <div className="h-4 bg-secondary rounded w-full mb-8" />
        <div className="h-64 bg-secondary rounded-lg mb-8" />
        <div className="space-y-3">
          <div className="h-4 bg-secondary rounded w-full" />
          <div className="h-4 bg-secondary rounded w-5/6" />
          <div className="h-4 bg-secondary rounded w-4/6" />
          <div className="h-4 bg-secondary rounded w-full" />
          <div className="h-4 bg-secondary rounded w-3/4" />
        </div>
      </div>
    </main>
  );
}
