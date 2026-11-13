export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
        <h1 className="text-4xl font-bold tracking-tight">Crewlane</h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-400">
          Get started by editing{" "}
          <code className="bg-black/[.05] dark:bg-white/[.06] px-1.5 py-0.5 rounded font-mono text-sm">
            src/app/page.tsx
          </code>
          .
        </p>
      </main>
    </div>
  );
}
