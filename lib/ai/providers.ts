import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

export const gpt4o = openai('gpt-4o-2024-08-06');

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
        'chat-model': gpt4o,
        'chat-model-reasoning': wrapLanguageModel({
          model: gpt4o,
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        'title-model': gpt4o,
        'artifact-model': gpt4o,
      },
    });
