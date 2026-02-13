import "./globals.css";
import { Baloo_2, Nunito } from 'next/font/google';
import { getSiteUrl } from '@/lib/seo';

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-body',
});

const baloo = Baloo_2({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
});

const siteUrl = getSiteUrl();

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'IXL Practice App',
    template: '%s | IXL Practice App',
  },
  description: 'Adaptive practice platform for school skills with interactive question types and instant feedback.',
  keywords: [
    'adaptive learning',
    'practice questions',
    'math practice',
    'english practice',
    'education app',
    'IXL style practice',
  ],
  authors: [{ name: "IXL Learning" }],
  creator: "IXL Learning",
  publisher: "IXL Learning",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: "IXL Practice App",
    description: "Adaptive skill practice with interactive question types for kids.",
    url: siteUrl,
    siteName: 'IXL Practice App',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'IXL Practice App',
    description: 'Adaptive skill practice with interactive question types.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#22c55e" />
      </head>
      <body className={`${nunito.variable} ${baloo.variable}`}>{children}</body>
    </html>
  );
}
