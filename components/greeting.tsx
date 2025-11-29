import { motion } from 'framer-motion';

import { CatButtholeIcon } from './cat-butthole-icon';

export const Greeting = () => {
  return (
    <div
      key="overview"
      className="max-w-3xl mx-auto md:mt-20 px-8 size-full flex flex-col justify-center"
      data-testid="chat-loading-placeholder"
    >
      <motion.div
        className="flex flex-col items-start gap-4 text-left"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.5 }}
      >
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 text-muted-foreground"
        >
          <CatButtholeIcon
            size={72}
            className="animate-cat-spin drop-shadow-sm"
            aria-hidden="true"
          />
          <span className="text-lg font-medium leading-none">
            Loading chat history…
          </span>
        </div>

        <div className="text-2xl font-semibold text-foreground">
          Hello there!
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.6 }}
        className="text-2xl text-muted-foreground"
      >
        How can I help you today?
      </motion.div>
    </div>
  );
};
