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

type MenuItem = {
  name: string;
  href: string;
  children?: { name: string; href: string }[];
};

const menuItems: MenuItem[] = [
  { name: "Home", href: "/" },
  {
    name: "Services",
    href: "/services",
    children: [
      { name: "OpenClaw Setup", href: "/services/openclaw" },
      { name: "Paperclip AI Company", href: "/services/paperclip" },
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
      <nav aria-label="Primary" className="group fixed z-20 w-full pt-2 px-1">
        <div
          className={cn(
            "mx-auto max-w-7xl rounded-3xl border border-border/0 px-6 transition-all duration-200 group-hover:border-border lg:px-12",
            hasScrolled && "bg-background/50 backdrop-blur-2xl border-border/30"
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
                    menuState ? "rotate-180 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
                  )}
                />
                <X
                  className={cn(
                    "absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200",
                    menuState ? "rotate-0 scale-100 opacity-100" : "-rotate-180 scale-0 opacity-0"
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
                    <li key={item.href} className="relative group/nav">
                      <Link
                        href={item.href}
                        className="text-muted-foreground hover:text-accent-foreground flex items-center gap-1 duration-150"
                      >
                        <span>{item.name}</span>
                        {item.children && (
                          <ChevronDown className="h-3 w-3 transition-transform duration-150 group-hover/nav:rotate-180" />
                        )}
                      </Link>
                      {item.children && (
                        <div className="absolute left-0 top-full pt-2 opacity-0 pointer-events-none group-hover/nav:opacity-100 group-hover/nav:pointer-events-auto transition-opacity duration-150">
                          <div className="bg-background rounded-xl border shadow-md py-1 min-w-[180px]">
                            {item.children.map((child) => (
                              <Link
                                key={child.href}
                                href={child.href}
                                className="block px-4 py-2 text-sm text-muted-foreground hover:text-accent-foreground hover:bg-muted/50 duration-150"
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
                className="bg-background mb-6 block w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:hidden"
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
                          className="text-muted-foreground hover:text-accent-foreground block duration-150"
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
                                  className="text-muted-foreground/70 hover:text-accent-foreground block text-sm duration-150"
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
                      <Button className="rounded-full pl-5 pr-3 text-base">
                        <span className="text-nowrap">Book now</span>
                        <ChevronRight className="ml-1" />
                      </Button>
                    }
                  />
                </div>
              </motion.div>
            )}
            <div className="hidden lg:flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
              <ScheduleCallModal
                trigger={
                  <Button className="rounded-full pl-5 pr-3 text-base">
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
