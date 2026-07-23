/**
 * Traduction du flux SSE Mistral vers le flux NDJSON attendu par l'intégration Ollama de HA, et
 * détection du JSON structuré une fois le texte complet assemblé. Port de
 * stream_mistral_to_ollama/extract_json_from_text (ollama-sim/app/main.py), voir specs §4 pour les
 * pièges corrigés ici :
 *
 *  - tool_calls fragmentés par index sur plusieurs chunks → accumulés dans toolCallBuffer, JSON
 *    des arguments parsé une seule fois le flux terminé (jamais fragment par fragment).
 *  - signal interne de fin de flux (texte + tool_calls assemblés) → jamais mêlé aux lignes NDJSON
 *    yield-ées : porté par la valeur de retour du générateur asynchrone (TReturn), pas par une
 *    ligne du flux — élimine structurellement le risque de fuite vers HA que le prototype gérait
 *    par filtrage a posteriori.
 *  - balises markdown ```json autour du JSON structuré → retirées avant tentative de parsing.
 */

import type { AssembledMistralResponse, MistralChatCompletionChunk, MistralToolCall } from './types';
import { STRUCTURED_TYPES } from './types';

export function nowIso(): string {
  return new Date().toISOString().replace(/(\.\d{3})\d*Z$/, '$1Z');
}

export function makeOllamaContentChunk(model: string, content: string): string {
  return JSON.stringify({
    model,
    created_at: nowIso(),
    message: { role: 'assistant', content },
    done: false
  }) + '\n';
}

export function makeOllamaDoneChunk(model: string, promptTokens = 0, completionTokens = 0, toolCalls?: MistralToolCall[]): string {
  const chunk: Record<string, unknown> = {
    model,
    created_at: nowIso(),
    message: { role: 'assistant', content: '', ...(toolCalls?.length ? { tool_calls: toolCalls } : {}) },
    done: true,
    done_reason: 'stop',
    total_duration: 0,
    load_duration: 0,
    prompt_eval_count: promptTokens,
    prompt_eval_duration: 0,
    eval_count: completionTokens,
    eval_duration: 0
  };
  return JSON.stringify(chunk) + '\n';
}

export function makeOllamaErrorChunk(model: string, message: string): string {
  return JSON.stringify({
    model,
    created_at: nowIso(),
    message: { role: 'assistant', content: '' },
    done: true,
    done_reason: 'stop',
    error: message
  }) + '\n';
}

/** Retire les balises markdown ```json ... ``` (ou ``` ... ```) avant tentative de parsing JSON. */
export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  const lines = trimmed.split('\n');
  const body = lines[lines.length - 1].trim() === '```' ? lines.slice(1, -1) : lines.slice(1);
  return body.join('\n');
}

/** Tente d'extraire un JSON structuré (type ∈ STRUCTURED_TYPES) du texte assemblé. */
export function extractStructuredJson(text: string): Record<string, unknown> | null {
  const cleaned = stripMarkdownFences(text);
  try {
    const data = JSON.parse(cleaned);
    if (data && typeof data === 'object' && STRUCTURED_TYPES.has(data.type)) {
      return data;
    }
  } catch {
    // pas un JSON exploitable, réponse conversationnelle libre — comportement attendu
  }
  return null;
}

interface ToolCallBufferEntry {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

/**
 * Traduit un flux SSE Mistral (lignes `data: {...}`) en lignes NDJSON Ollama, yield-ées au fur et
 * à mesure. La valeur de retour du générateur (accessible via son dernier `{done:true, value}`)
 * porte le texte et les tool_calls entièrement assemblés — jamais mêlée au flux yield-é.
 *
 * Ne yield PAS le chunk final `done:true` : c'est à l'appelant (IaService) de l'écrire, une fois
 * qu'il sait que ce round Mistral est réellement le dernier de la boucle d'outils (specs §8) — un
 * round intermédiaire (appel d'outil) ne doit jamais être vu comme "terminé" par HA.
 */
export async function* translateMistralStream(
  body: AsyncIterable<Uint8Array>,
  ollamaModel: string
): AsyncGenerator<string, AssembledMistralResponse, void> {
  const decoder = new TextDecoder();
  let buffer = '';
  let promptTokens = 0;
  let completionTokens = 0;
  const textParts: string[] = [];
  const toolCallBuffer = new Map<number, ToolCallBufferEntry>();
  let finished = false;

  outer: for await (const bytes of body) {
    buffer += decoder.decode(bytes as Uint8Array, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIdx).trimEnd();
      buffer = buffer.slice(newlineIdx + 1);

      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') { finished = true; break outer; }

      let chunk: MistralChatCompletionChunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }

      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      const content = delta?.content || '';
      const finishReason = choice?.finish_reason;

      for (const tcDelta of delta?.tool_calls || []) {
        const idx = tcDelta.index ?? 0;
        if (!toolCallBuffer.has(idx)) {
          toolCallBuffer.set(idx, { id: tcDelta.id || '', type: tcDelta.type || 'function', function: { name: '', arguments: '' } });
        }
        const entry = toolCallBuffer.get(idx)!;
        if (tcDelta.function?.name) entry.function.name += tcDelta.function.name;
        if (tcDelta.function?.arguments) entry.function.arguments += tcDelta.function.arguments;
      }

      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
        completionTokens = chunk.usage.completion_tokens ?? completionTokens;
      }

      if (content) {
        textParts.push(content);
        yield makeOllamaContentChunk(ollamaModel, content);
      }

      if (finishReason === 'stop' || finishReason === 'tool_calls') {
        finished = true;
        break outer;
      }
    }
  }
  void finished;

  const toolCalls: MistralToolCall[] = [];
  for (const tc of toolCallBuffer.values()) {
    let args: string | Record<string, unknown> = tc.function.arguments;
    try {
      args = JSON.parse(tc.function.arguments);
    } catch {
      // arguments non-JSON — conservés en texte brut, ToolExecutor décidera quoi en faire
    }
    toolCalls.push({ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: args } });
  }

  return { text: textParts.join(''), toolCalls, promptTokens, completionTokens };
}
