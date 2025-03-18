import { ShipkitProvider } from '@/components/providers/shipkit-provider';
import { TypographyProvider } from '@/components/providers/typography-provider';
import type { AppProps } from 'next/app';
import { NuqsAdapter } from 'nuqs/adapters/next/pages';

export default function MyApp({ Component, pageProps }: AppProps) {
	return (
		<ShipkitProvider session={pageProps.session} pageProps={pageProps}>
			<NuqsAdapter>
				{/* Needed to get fonts working for the pages router */}
				<TypographyProvider>
					<Component {...pageProps} />
				</TypographyProvider>
			</NuqsAdapter>
		</ShipkitProvider>
	)
}
