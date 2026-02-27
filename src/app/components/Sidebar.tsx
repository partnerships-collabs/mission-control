'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { name: "Overview", href: "/", icon: "🏠" },
  { name: "Projects", href: "/projects", icon: "📋" },
  { name: "Pipeline", href: "/pipeline", icon: "🔬" },
  { name: "Cron Jobs", href: "/crons", icon: "⏰" },
  { name: "Agents", href: "/agents", icon: "🤖" },
  { name: "Calendar", href: "/calendar", icon: "📅" },
  { name: "Infrastructure", href: "/infrastructure", icon: "🖥️" },
  { name: "Blacklisted Domains", href: "/blacklisted-domains", icon: "🚫" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-64 bg-zinc-800 border-r border-zinc-700 flex flex-col">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-zinc-100">OpenClaw</h2>
        <p className="text-sm text-zinc-400">Mission Control</p>
      </div>
      
      <nav className="flex-1 px-4 pb-4">
        <ul className="space-y-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
                  }`}
                >
                  <span className="mr-3 text-lg">{item.icon}</span>
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile toggle - hidden on desktop */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <button className="bg-zinc-800 border border-zinc-700 rounded-md p-2">
          <span className="text-zinc-100">☰</span>
        </button>
      </div>
    </div>
  );
}