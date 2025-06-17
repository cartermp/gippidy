import fs from 'node:fs';
import path from 'node:path';
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
} from '@playwright/test';
import { generateId } from 'ai';
import { ChatPage } from './pages/chat';
import { getUnixTime } from 'date-fns';

export type UserContext = {
  context: BrowserContext;
  page: Page;
  request: APIRequestContext;
};

export async function createAuthenticatedContext({
  browser,
  name,
  chatModel = 'chat-model',
}: {
  browser: Browser;
  name: string;
  chatModel?: 'chat-model' | 'chat-model-reasoning';
}): Promise<UserContext> {
  const testUserId = `test-user-${name}`;
  const testUserEmail = `test-${name}@example.com`;

  // Create context with test headers for auth bypass
  const context = await browser.newContext({
    extraHTTPHeaders: {
      'x-test-user-id': testUserId,
      'x-test-user-email': testUserEmail,
      'user-agent': 'Playwright Test Browser',
    },
  });
  
  const page = await context.newPage();

  // For integration tests, we mainly need the request context with auth headers
  // The auth() function will recognize these headers and create mock sessions
  return {
    context,
    page,
    request: context.request,
  };
}

export function generateRandomTestUser() {
  const email = `test-${getUnixTime(new Date())}@playwright.com`;
  const password = generateId(16);

  return {
    email,
    password,
  };
}
