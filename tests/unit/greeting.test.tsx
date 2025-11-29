import assert from 'node:assert';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Greeting } from '../../components/greeting';

test('Greeting shows animated loading status for chat history', () => {
  const markup = renderToStaticMarkup(<Greeting />);

  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /Loading your conversation/);
  assert.match(markup, /animate-cat-spin/);
});
