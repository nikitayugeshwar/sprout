import { Plus_Jakarta_Sans, Fraunces } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../components/AuthProvider';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
});

export const metadata = {
  title: {
    default: 'Sprout — growth, milestones and vaccines, actually measured',
    template: '%s · Sprout',
  },
  description:
    'Sprout plots your child against the real WHO Child Growth Standards, tracks CDC developmental milestones and keeps the IAP immunisation schedule on time.',
  openGraph: {
    title: 'Sprout',
    description: 'Growth percentiles, milestones and vaccines for the first five years — measured against the actual WHO standards.',
    type: 'website',
  },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf9f5' },
    { media: '(prefers-color-scheme: dark)', color: '#12160f' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${fraunces.variable}`}>
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-leaf-500 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
