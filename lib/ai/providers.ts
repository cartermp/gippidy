import {
  customProvider,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

export const gpt4o = openai('gpt-4o');
export const gpt41 = openai('gpt-4.1');
export const o4mini = openai('o4-mini');

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
        'chat-model': gpt41,
        'chat-model-reasoning': o4mini,  // Use actual reasoning model
        'title-model': gpt41,
        'artifact-model': gpt41,
      },
    });
