import { ShipkitProvider } from '@/components/providers/shipkit-provider'
import type { AppProps } from 'next/app'

export default function MyApp({ Component, pageProps }: AppProps) {
	return (
		<ShipkitProvider session={pageProps.session} pageProps={pageProps}>
			<Component {...pageProps} />
		</ShipkitProvider>
	)
}
