import { CatButtholeIcon } from './cat-butthole-icon';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { motion } from 'framer-motion';

export const Greeting = () => {
  return (
    <div
      key="overview"
      className="max-w-3xl mx-auto md:mt-20 px-8 size-full flex flex-col justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.3 }}
          className="relative"
        >
          <span className="inline-flex items-center justify-center rounded-full bg-muted p-3 text-primary shadow-sm">
            <span className="absolute inset-0 rounded-full border border-primary/30 animate-cat-spin" aria-hidden="true" />
            <CatButtholeIcon size={40} className="text-primary drop-shadow-sm" />
          </span>
          <VisuallyHidden>Loading your conversation</VisuallyHidden>
        </motion.div>

        <div className="flex flex-col gap-1 text-left">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ delay: 0.15 }}
            className="text-lg font-semibold text-foreground"
          >
            Getting your conversation ready...
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ delay: 0.3 }}
            className="text-sm text-muted-foreground"
          >
            We are fetching your chat history so you can pick up where you left off.
          </motion.div>
        </div>
      </div>
    </div>
  );
};
