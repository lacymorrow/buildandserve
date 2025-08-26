'use client'
import Link from 'next/link'
import { ChevronRight, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import React from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/assets/logo'
import { usePathname } from 'next/navigation'
import { ScheduleCallModal } from '@/components/modals/schedule-call-modal'

const menuItems = [
    { name: 'Home', href: '/' },
    { name: 'FAQ', href: '#faq' },
]

export const HeroHeader = () => {
    const pathname = usePathname()
    const isNotHome = pathname !== '/'
    const [menuState, setMenuState] = React.useState(false)
    const [hasScrolled, setHasScrolled] = React.useState(false)
    const [elementsVisible, setElementsVisible] = React.useState(false)

    React.useEffect(() => {
        const handleScroll = () => {
            if (isNotHome) {
                setHasScrolled(true)
                setElementsVisible(true)
                return
            }

            const scrollY = window.scrollY
            setHasScrolled(scrollY > 50)
            setElementsVisible(scrollY > 100)
        }

        const handleClickOutside = (event: MouseEvent) => {
            if (menuState && !(event.target as Element).closest('nav')) {
                setMenuState(false)
            }
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && menuState) {
                setMenuState(false)
            }
        }

        window.addEventListener('scroll', handleScroll)
        document.addEventListener('click', handleClickOutside)
        document.addEventListener('keydown', handleKeyDown)
        handleScroll() // check on initial render

        return () => {
            window.removeEventListener('scroll', handleScroll)
            document.removeEventListener('click', handleClickOutside)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [menuState, isNotHome])

    return (
        <header>
            <nav
                className="group fixed z-20 w-full pt-2 px-1">
                <div className={cn('mx-auto max-w-7xl rounded-3xl border border-border/0 px-6 transition-all duration-200 group-hover:border-border lg:px-12', hasScrolled && 'bg-background/50 backdrop-blur-2xl border-border/30')}>
                    <motion.div
                        key={1}
                        className={cn('relative flex flex-wrap items-center justify-between gap-6 py-3 duration-200 lg:gap-0 lg:py-6', hasScrolled && 'lg:py-4')}>
                        <div className="flex w-full items-center justify-between gap-12 lg:w-auto">
                            <Link
                                href="/"
                                aria-label="home"
                                className="flex items-center space-x-2">
                                <Logo />
                            </Link>

                            <motion.button
                                onClick={() => setMenuState(!menuState)}
                                aria-label={menuState ? 'Close Menu' : 'Open Menu'}
                                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.2 }}>
                                <Menu className={cn("m-auto size-6 duration-200", menuState ? "rotate-180 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100")} />
                                <X className={cn("absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200", menuState ? "rotate-0 scale-100 opacity-100" : "-rotate-180 scale-0 opacity-0")} />
                            </motion.button>

                            <motion.div
                                className="hidden lg:block"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: elementsVisible ? 1 : 0 }}
                                transition={{ duration: 0.2 }}>
                                <ul className="flex gap-8 text-sm">
                                    {menuItems.map((item, index) => (
                                        <li key={index}>
                                            <Link
                                                href={item.href}
                                                className="text-muted-foreground hover:text-accent-foreground block duration-150">
                                                <span>{item.name}</span>
                                            </Link>
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
                                    <ul className="space-y-6 text-base">
                                        {menuItems.map((item, index) => (
                                            <li key={index}>
                                                <Link
                                                    href={item.href}
                                                    className="text-muted-foreground hover:text-accent-foreground block duration-150"
                                                    onClick={() => setMenuState(false)} // Close menu on link click
                                                >
                                                    <span>{item.name}</span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
                                    <ScheduleCallModal
                                        trigger={
                                            <Button
                                                className="rounded-full pl-5 pr-3 text-base"
                                            >
                                                <span className="text-nowrap">Book now</span>
                                                <ChevronRight className="ml-1" />
                                            </Button>
                                        }
                                    />
                                </div>
                            </motion.div>
                        )}
                    </motion.div>
                </div>
            </nav>
        </header>
    )
}
