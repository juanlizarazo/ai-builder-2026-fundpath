import Anthropic from '@anthropic-ai/sdk';
import * as logger from 'firebase-functions/logger';
import { CLAUDE_MODEL, MAX_RETRIES, RETRY_DELAY_MS } from './ai.constants';

export class ClaudeService {
  private _client: Anthropic;

  constructor() {
    this._client = new Anthropic({
      apiKey: process.env['ANTHROPIC_API_KEY'],
    });
  }

  public async complete(prompt: string, systemPrompt: string): Promise<string> {
    let lastError: Error = new Error('No attempts made');

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this._client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        });

        logger.info('Claude token usage', {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        });

        const content = response.content[0];

        if (content.type !== 'text') {
          throw new Error('Unexpected response type from Claude');
        }

        return content.text;
      } catch (err) {
        lastError = err as Error;

        if (attempt < MAX_RETRIES - 1) {
          await new Promise(resolve =>
            setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt))
          );
        }
      }
    }

    throw lastError;
  }

  public async completeJson<T>(prompt: string, systemPrompt: string): Promise<T> {
    const text = await this.complete(prompt, systemPrompt);

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Failed to parse Claude response as JSON: ${text.substring(0, 200)}`);
    }
  }
}
