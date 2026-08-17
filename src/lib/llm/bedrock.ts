/**
 * Amazon Bedrock client.
 *
 * Uses a Bedrock API key (bearer token) rather than SigV4 access keys, which
 * is what the hackathon workshop account issues. Kept to plain fetch against
 * the InvokeModel endpoint — no SDK — because the bearer-token auth path is
 * newer than most SDK helpers and this is one HTTP call.
 */

export interface BedrockTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface InvokeOptions {
  system: string;
  userText: string;
  tool: BedrockTool;
  maxTokens?: number;
}

export function bedrockConfig(): { key: string; region: string; modelId: string } | null {
  const key = process.env.AWS_BEARER_TOKEN_BEDROCK;
  const region = process.env.AWS_REGION ?? 'us-west-2';
  const modelId = process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-opus-4-6-v1';
  if (!key || key === 'PASTE_KEY_HERE') return null;
  if (process.env.USE_BEDROCK !== '1') return null;
  return { key, region, modelId };
}

export function isBedrockConfigured(): boolean {
  return bedrockConfig() !== null;
}

export class BedrockError extends Error {}

/**
 * Calls the model and returns the arguments of the forced tool call. Using a
 * forced tool with a strict schema is how we guarantee the response is the
 * shape the template needs, rather than prose we have to parse.
 */
export async function invokeStructured(opts: InvokeOptions): Promise<Record<string, unknown>> {
  const cfg = bedrockConfig();
  if (!cfg) throw new BedrockError('Bedrock is not configured.');

  const url = `https://bedrock-runtime.${cfg.region}.amazonaws.com/model/${encodeURIComponent(
    cfg.modelId,
  )}/invoke`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: opts.maxTokens ?? 2000,
      system: opts.system,
      messages: [{ role: 'user', content: opts.userText }],
      tools: [opts.tool],
      tool_choice: { type: 'tool', name: opts.tool.name },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new BedrockError(`Bedrock returned ${res.status}: ${body.slice(0, 300)}`);
  }

  const body = (await res.json()) as {
    content?: Array<{ type: string; name?: string; input?: Record<string, unknown> }>;
    stop_reason?: string;
  };

  const call = (body.content ?? []).find((b) => b.type === 'tool_use' && b.name === opts.tool.name);
  if (!call?.input) {
    throw new BedrockError(
      `Model did not return the expected tool call (stop_reason: ${body.stop_reason ?? 'unknown'}).`,
    );
  }
  return call.input;
}
