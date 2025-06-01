'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

// Artistic representation of a cat's posterior
const CatButtholeIcon = () => {
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      className="text-pink-400"
    >
      {/* Outer fur circle */}
      <circle
        cx="60"
        cy="60"
        r="50"
        fill="#8B4513"
        stroke="#654321"
        strokeWidth="2"
      />
      {/* Inner pink area */}
      <circle
        cx="60"
        cy="60"
        r="35"
        fill="#FFB6C1"
        stroke="#FF69B4"
        strokeWidth="1"
      />
      {/* The infamous asterisk pattern */}
      <g
        transform="translate(60, 60)"
        stroke="#8B0000"
        strokeWidth="3"
        fill="none"
      >
        <line x1="-15" y1="0" x2="15" y2="0" />
        <line x1="-10.6" y1="-10.6" x2="10.6" y2="10.6" />
        <line x1="0" y1="-15" x2="0" y2="15" />
        <line x1="-10.6" y1="10.6" x2="10.6" y2="-10.6" />
      </g>
      {/* Center dot */}
      <circle cx="60" cy="60" r="3" fill="#8B0000" />
    </svg>
  );
};

export default function AuthErrorPage() {
  const router = useRouter();

  return (
    <div className="flex h-dvh w-screen bg-background items-center justify-center">
      <div className="max-w-md mx-auto text-center px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{
            duration: 0.8,
            type: 'spring',
            stiffness: 100,
            damping: 10,
          }}
          className="mb-8 flex justify-center"
        >
          <CatButtholeIcon />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="space-y-4"
        >
          <h1 className="text-4xl font-bold text-foreground mb-4">SIKE!</h1>

          <p className="text-xl text-muted-foreground mb-2">
            You can&apos;t log in!
          </p>

          <p className="text-lg text-pink-500 font-medium mb-6">
            Enjoy the cat butthole! 🐱
          </p>

          <div className="space-y-3">
            <Button
              onClick={() => router.push('/login')}
              className="w-full"
              variant="outline"
            >
              Try Again (if you dare) 😈
            </Button>

            <Button
              onClick={() => window.open('https://whyamialoser.com/', '_blank')}
              className="w-full"
              variant="ghost"
            >
              Accept Defeat 😔
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
