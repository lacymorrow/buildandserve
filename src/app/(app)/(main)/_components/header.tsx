"use client";
import { ChevronDown, ChevronRight, Menu, X } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { Logo } from "@/components/assets/logo";
import { ScheduleCallModal } from "@/components/modals/schedule-call-modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MenuItem {
  name: string;
  href: string;
  children?: { name: string; href: string }[];
}

const menuItems: MenuItem[] = [
  { name: "Home", href: "/" },
  {
    name: "Services",
    href: "/services",
    children: [
      { name: "OpenClaw Setup", href: "/services/openclaw-setup" },
      { name: "Paperclip AI Company", href: "/services/paperclip-ai" },
    ],
  },
  { name: "FAQ", href: "/#faq" },
];

export const HeroHeader = () => {
  const pathname = usePathname();
  const isNotHome = pathname !== "/";
  const [menuState, setMenuState] = React.useState(false);
  const [hasScrolled, setHasScrolled] = React.useState(false);
  const [elementsVisible, setElementsVisible] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      if (isNotHome) {
        setHasScrolled(true);
        setElementsVisible(true);
        return;
      }

      const scrollY = window.scrollY;
      setHasScrolled(scrollY > 50);
      setElementsVisible(scrollY > 100);
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (menuState && !(event.target as Element).closest("nav")) {
        setMenuState(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuState) {
        setMenuState(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    handleScroll(); // check on initial render

    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuState, isNotHome]);

  return (
    <header>
      <nav aria-label="Primary" className="group fixed z-20 w-full px-1 pt-2">
        <div
          className={cn(
            "mx-auto max-w-7xl rounded-3xl border border-border/0 px-6 transition-all duration-200 group-hover:border-border lg:px-12",
            hasScrolled && "border-border/30 bg-background/50 backdrop-blur-2xl"
          )}
        >
          <motion.div
            key={1}
            className={cn(
              "relative flex flex-wrap items-center justify-between gap-6 py-3 duration-200 lg:gap-0 lg:py-6",
              hasScrolled && "lg:py-4"
            )}
          >
            <div className="flex w-full items-center justify-between gap-12 lg:w-auto">
              <Link href="/" aria-label="home" className="flex items-center space-x-2">
                <Logo />
              </Link>

              <motion.button
                onClick={() => setMenuState(!menuState)}
                aria-label={menuState ? "Close Menu" : "Open Menu"}
                aria-expanded={menuState}
                aria-controls="primary-menu"
                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <Menu
                  className={cn(
                    "m-auto size-6 duration-200",
                    menuState ? "scale-0 rotate-180 opacity-0" : "scale-100 rotate-0 opacity-100"
                  )}
                />
                <X
                  className={cn(
                    "absolute inset-0 m-auto size-6 scale-0 -rotate-180 opacity-0 duration-200",
                    menuState ? "scale-100 rotate-0 opacity-100" : "scale-0 -rotate-180 opacity-0"
                  )}
                />
              </motion.button>

              <motion.div
                className="hidden lg:flex lg:items-center lg:gap-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: elementsVisible ? 1 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ul className="flex gap-8 text-sm">
                  {menuItems.map((item) => (
                    <li key={item.href} className="group/nav relative">
                      <Link
                        href={item.href}
                        className="flex items-center gap-1 text-muted-foreground duration-150 hover:text-accent-foreground"
                      >
                        <span>{item.name}</span>
                        {item.children && (
                          <ChevronDown className="h-3 w-3 transition-transform duration-150 group-hover/nav:rotate-180" />
                        )}
                      </Link>
                      {item.children && (
                        <div className="pointer-events-none absolute top-full left-0 pt-2 opacity-0 transition-opacity duration-150 group-hover/nav:pointer-events-auto group-hover/nav:opacity-100">
                          <div className="min-w-[180px] rounded-xl border bg-background py-1 shadow-md">
                            {item.children.map((child) => (
                              <Link
                                key={child.href}
                                href={child.href}
                                className="block px-4 py-2 text-sm text-muted-foreground duration-150 hover:bg-muted/50 hover:text-accent-foreground"
                              >
                                {child.name}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>

            {menuState && (
              <motion.div
                className="mb-6 block w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border bg-background p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:hidden"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="lg:hidden">
                  <ul id="primary-menu" className="space-y-6 text-base">
                    {menuItems.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className="block text-muted-foreground duration-150 hover:text-accent-foreground"
                          onClick={() => setMenuState(false)}
                        >
                          <span>{item.name}</span>
                        </Link>
                        {item.children && (
                          <ul className="mt-3 ml-4 space-y-3">
                            {item.children.map((child) => (
                              <li key={child.href}>
                                <Link
                                  href={child.href}
                                  className="block text-sm text-muted-foreground/70 duration-150 hover:text-accent-foreground"
                                  onClick={() => setMenuState(false)}
                                >
                                  {child.name}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
                  <ScheduleCallModal
                    trigger={
                      <Button className="rounded-full pr-3 pl-5 text-base">
                        <span className="text-nowrap">Book now</span>
                        <ChevronRight className="ml-1" />
                      </Button>
                    }
                  />
                </div>
              </motion.div>
            )}
            <div className="hidden w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit lg:flex">
              <ScheduleCallModal
                trigger={
                  <Button className="rounded-full pr-3 pl-5 text-base">
                    <span className="text-nowrap">Book now</span>
                    <ChevronRight className="ml-1" />
                  </Button>
                }
              />
            </div>
          </motion.div>
        </div>
      </nav>
    </header>
  );
};
