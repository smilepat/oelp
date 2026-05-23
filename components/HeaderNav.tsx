"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  short: string;
}

const ITEMS: NavItem[] = [
  { href: "/", label: "Home", short: "Home" },
  { href: "/diagnose", label: "F1 진단", short: "진단" },
  { href: "/map", label: "F2 Map", short: "Map" },
  { href: "/queue", label: "F3 학습 큐", short: "큐" },
  { href: "/sessions", label: "Sessions", short: "세션" },
  { href: "/regression-history", label: "Audit", short: "Audit" },
];

/**
 * Compact top header navigation visible on every route.
 *
 * Active route highlighted via emerald underline. Tucks to icon-only
 * labels (short) on mobile to fit 6 routes in 375px.
 */
export function HeaderNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/85 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/85">
      <nav className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-3 py-2 text-xs">
        <Link
          href="/"
          className="mr-1 shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500"
        >
          OELP
        </Link>
        {ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-md px-2 py-1 transition-colors ${
                active
                  ? "bg-emerald-50 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <span className="hidden sm:inline">{item.label}</span>
              <span className="sm:hidden">{item.short}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
