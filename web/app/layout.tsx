import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { AppProvider } from '@/lib/app/app-context'
import { AppChrome } from '@/components/layout/app-chrome'
import { ServiceWorkerRegistrar } from '@/lib/pwa/service-worker-registrar'

// Self-hosted fonts (OFL): copied from the iOS app's cleared resources and
// converted losslessly to WOFF2 with fontTools (no subsetting — glyph coverage
// is unchanged). Licence texts ship in public/licenses/.
const sans = localFont({
  src: [
    { path: '../fonts/PlusJakartaSans-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/PlusJakartaSans-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/PlusJakartaSans-SemiBold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
})

const serif = localFont({
  src: [{ path: '../fonts/SourceSerif4-Regular.woff2', weight: '400', style: 'normal' }],
  variable: '--font-source-serif-4',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Ezber — Quran memorization and listening',
  description:
    'Pick a surah and a section, repeat each verse, follow the transliteration, and keep everything offline. No account required.',
  applicationName: 'Ezber',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Ezber',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#EDEBE5' },
    { media: '(prefers-color-scheme: dark)', color: '#0F0D08' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="font-sans">
        <AppProvider>
          <AppChrome>{children}</AppChrome>
          <ServiceWorkerRegistrar />
        </AppProvider>
      </body>
    </html>
  )
}
