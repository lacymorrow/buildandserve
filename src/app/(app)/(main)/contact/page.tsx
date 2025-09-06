import { MailIcon } from "lucide-react";
import { ContactForm } from "@/components/forms/contact-form";
import { Link } from "@/components/primitives/link-with-transition";
import { Boxes } from "@/components/ui/background-boxes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routes } from "@/config/routes";
import { siteConfig } from "@/config/site-config";

export default function ContactPage() {
	return (
		<div className="relative min-h-screen w-full overflow-hidden bg-background">
			{/* Animated background */}
			<div className="absolute inset-0 h-full w-full">
				<div className="relative h-full w-full">
					<Boxes />
					<div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
				</div>
			</div>

			{/* Content */}
			<div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center px-4 py-20">
				<div className="mb-12 text-center">
					<h1 className="mb-4 text-4xl font-bold tracking-tight">Get in Touch</h1>
					<p className="text-lg text-muted-foreground">
						Have a question or want to learn more? We&apos;d love to hear from you.
					</p>
				</div>

				<div className="flex w-full max-w-6xl flex-col gap-8 lg:flex-row">
					{/* Contact Methods */}
					<div className="flex w-full flex-col gap-4 lg:w-auto lg:min-w-[300px] lg:gap-6">
						{/* Email Card */}
						<Card className="flex w-full flex-col items-center p-6 text-center transition-all hover:shadow-lg">
							<div className="mb-4 rounded-full bg-primary/10 p-3">
								<MailIcon className="h-6 w-6 text-primary" />
							</div>
							<h3 className="mb-2 font-semibold">Email Us</h3>
							<p className="mb-4 text-sm text-muted-foreground">Drop us a line anytime</p>
							<Button variant="link" asChild>
								<Link href={routes.contact}>{siteConfig.email.support}</Link>
							</Button>
						</Card>

						{/* Chat Card */}
						{/* <Card className="flex flex-col items-center p-6 text-center transition-all hover:shadow-lg">
                            <div className="mb-4 rounded-full bg-primary/10 p-3">
                                <MessageCircleIcon className="h-6 w-6 text-primary" />
                            </div>
                            <h3 className="mb-2 font-semibold">Live Chat</h3>
                            <p className="mb-4 text-sm text-muted-foreground">
                                Chat with our support team
                            </p>
                            <Button variant="link" asChild>
                                <Link href={siteConfig.links.github}>
                                    Chat on GitHub
                                </Link>
                            </Button>
                        </Card> */}

						{/* Phone Card */}
						{/* <Card className="flex flex-col items-center p-6 text-center transition-all hover:shadow-lg">
							<div className="mb-4 rounded-full bg-primary/10 p-3">
								<PhoneIcon className="h-6 w-6 text-primary" />
							</div>
							<h3 className="mb-2 font-semibold">Phone</h3>
							<p className="mb-4 text-sm text-muted-foreground">
								Mon-Fri from 9am to 5pm
							</p>
							<Button variant="link" asChild>
								<Link href="tel:+1234567890">
									+1 (234) 567-890
								</Link>
							</Button>
						</Card> */}
					</div>

					{/* Contact Form */}
					<Card className="w-full p-6 lg:p-8">
						<div className="mb-6">
							<h2 className="mb-2 text-2xl font-semibold">Send us a Message</h2>
							<p className="text-muted-foreground">
								Fill out the form below and we&apos;ll get back to you as soon as possible.
							</p>
						</div>
						<ContactForm className="max-w-none" />
					</Card>
				</div>
			</div>
		</div>
	);
}
