import { Logo } from '@/components/assets/logo'
import Link from 'next/link'

const links = [

    {
        group: 'Company',
        items: [
            {
                title: 'Blog',
                href: '/blog',
            },
            {
                title: 'Pricing',
                href: '/pricing',
            },
            {
                title: 'Contact',
                href: '/contact',
            }
        ],
    },
    {
        group: 'Legal',
        items: [
            {
                title: 'Privacy',
                href: '/privacy-policy',
            },
            {
                title: 'Terms',
                href: '/terms-of-service',
            },
        ],
    },
]

export default function FooterSection() {
    return (
        <footer className="border-b bg-white pt-20 dark:bg-transparent">
            <div className="mx-auto max-w-5xl px-6">
                <div className="grid gap-12 md:grid-cols-5">
                    <div className="md:col-span-2">
                        <Link
                            href="/"
                            aria-label="go home"
                            className="block size-fit">
                            <Logo />
                        </Link>
                    </div>

                    <div className="grid grid-cols-2 gap-6 md:col-span-3 md:col-end-6">
                        {links.map((link, index) => (
                            <div
                                key={index}
                                className="space-y-4 text-sm">
                                <span className="block font-medium">{link.group}</span>
                                {link.items.map((item, index) => (
                                    <Link
                                        key={index}
                                        href={item.href}
                                        className="text-muted-foreground hover:text-primary block duration-150">
                                        <span>{item.title}</span>
                                    </Link>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="mt-12 flex flex-wrap items-end justify-between gap-6 border-t py-6">
                    <span className="text-muted-foreground order-last block text-center text-sm md:order-first">© {new Date().getFullYear()} Build And Serve, All rights reserved</span>
                    <div className="order-first flex flex-wrap justify-center gap-6 text-sm md:order-last">
                        <Link
                            href="https://x.com/lacybuilds"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="X/Twitter"
                            className="text-muted-foreground hover:text-primary block">
                            <svg
                                className="size-6"
                                xmlns="http://www.w3.org/2000/svg"
                                width="1em"
                                height="1em"
                                viewBox="0 0 24 24">
                                <path
                                    fill="currentColor"
                                    d="M10.488 14.651L15.25 21h7l-7.858-10.478L20.93 3h-2.65l-5.117 5.886L8.75 3h-7l7.51 10.015L2.32 21h2.65zM16.25 19L5.75 5h2l10.5 14z"></path>
                            </svg>
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
    )
}
