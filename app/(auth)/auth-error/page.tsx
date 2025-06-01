'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { CatButtholeIcon } from '@/components/cat-butthole-icon';

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
          <CatButtholeIcon size={120} />
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
