import { customProvider } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

export const gpt4o = openai('gpt-4o');
export const gpt41nano = openai('gpt-4.1-nano');
export const gpt41 = openai('gpt-4.1');
export const o4mini = openai('o4-mini');

export const geminiFlash = google('gemini-2.0-flash-lite');
export const geminiPro = google('gemini-2.5-pro');

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: {
        'chat-model': geminiFlash,
        'chat-model-reasoning': o4mini, // Use actual reasoning model
        'title-model': geminiFlash,
        'artifact-model': geminiFlash,
      },
    });
