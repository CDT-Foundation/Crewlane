import { AmbientBackground } from "@/components/artwork";
import { Skeleton } from "@/components/ui";

export default function LoginLoading() {
  return (
    <div className="relative flex min-h-screen flex-col justify-between p-6 md:p-10">
      <AmbientBackground />

      <header className="relative z-10 flex items-center justify-between">
        <Skeleton className="h-9 w-32 rounded-xl" />
        <Skeleton className="size-9 rounded-xl" />
      </header>

      <main className="relative z-10 mx-auto my-auto grid w-full max-w-4xl gap-8 lg:grid-cols-2 lg:items-center">
        {/* Left Artwork placeholder */}
        <div className="hidden lg:block">
          <Skeleton className="h-[460px] w-full rounded-3xl" />
        </div>

        {/* Right Form Card placeholder */}
        <div className="glass-panel mx-auto w-full max-w-md rounded-3xl p-8 shadow-2xl sm:p-10">
          <div className="mb-6 flex items-center gap-3">
            <Skeleton className="size-11 rounded-2xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-24 rounded-md" />
              <Skeleton className="h-3 w-36 rounded-md" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-20 rounded-md" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-20 rounded-md" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
            <Skeleton className="mt-4 h-11 w-full rounded-xl" />
          </div>
        </div>
      </main>

      <footer className="relative z-10 text-center">
        <Skeleton className="mx-auto h-3 w-64 rounded-md" />
      </footer>
    </div>
  );
}
