import { motion } from 'framer-motion';

export const Greeting = () => {
  return (
    <div
      key="overview"
      className="mx-auto flex size-full max-w-4xl flex-col items-center justify-center px-8 py-16 text-center"
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.5 }}
        className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
      >
        Your workspace is ready
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.6 }}
        className="bg-gradient-to-r from-primary/90 via-foreground to-muted-foreground bg-clip-text text-4xl font-semibold text-transparent md:text-5xl"
      >
        Hello there!
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.8 }}
        className="mt-3 text-lg text-muted-foreground md:text-xl"
      >
        How can I help you today?
      </motion.div>
    </div>
  );
};
