import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { AppTopNav } from "@/components/AppTopNav";
import { PageTransition } from "@/components/PageTransition";
import { CommandPalette } from "@/components/CommandPalette";

export function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppTopNav />
      <CommandPalette />
      <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">
        <Suspense fallback={<div className="min-h-[60vh]" />}>
          <PageTransition>
            <Outlet />
          </PageTransition>
        </Suspense>
      </main>
    </div>
  );
}
