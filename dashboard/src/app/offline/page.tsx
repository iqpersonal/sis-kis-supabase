"use client";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <div className="text-6xl">📡</div>
      <h1 className="text-2xl font-bold">You&apos;re Offline</h1>
      <p className="text-muted-foreground text-center max-w-md">
        It looks like you&apos;ve lost your internet connection. Some features
        may be unavailable until you&apos;re back online.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 rounded-md bg-primary px-6 py-2 text-primary-foreground hover:bg-primary/90"
      >
        Try Again
      </button>
    </div>
  );
}
