import { Outlet } from "react-router-dom";
import { AppTopNav } from "@/components/AppTopNav";

export function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppTopNav />
      <main className="flex-1 p-6 max-w-[1400px] w-full mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
