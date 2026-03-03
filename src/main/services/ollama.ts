import http from 'http';

export interface OllamaModel {
  name: string;
  size: number;
  details: { family: string; parameter_size: string };
}

export interface PVContent {
  titre: string;
  date: string;
  participants_direction: string[];
  participants_cse: string[];
  ordre_du_jour: string[];
  sections: PVSection[];
  decisions: string[];
  conclusion: string;
}

export interface PVSection {
  titre: string;
  resume_direction: string;
  resume_cse: string;
  discussion: string;
}

// Max chars per chunk (~4000 tokens with French text)
const CHUNK_MAX_CHARS = 15000;
// Threshold above which we split into chunks
const CHUNK_THRESHOLD = 20000;

const CHUNK_SYSTEM_PROMPT = `Tu es un rédacteur professionnel de procès-verbaux de réunions CSE.

Analyse cet EXTRAIT de transcription de réunion CSE et extrais les informations structurées.

RÉPONDS UNIQUEMENT avec un objet JSON :
{"participants_direction":["string"],"participants_cse":["string"],"points_abordes":[{"titre":"string","resume_direction":"string","resume_cse":"string","discussion":"string"}],"decisions":["string"],"informations":{"titre":"string","date":"string","autres":"string"}}`;

const MERGE_SYSTEM_PROMPT = `Tu es un rédacteur professionnel de procès-verbaux de réunions CSE.

Je te fournis les analyses partielles d'une réunion CSE découpée en plusieurs parties. Fusionne-les en un PV unique, cohérent et complet.

RÈGLES :
- Déduplique les participants (même personne mentionnée dans plusieurs parties)
- Fusionne les points abordés similaires
- Regroupe les décisions sans doublons
- Identifie le titre et la date de la réunion
- Ton formel et professionnel

RÉPONDS UNIQUEMENT avec un objet JSON :
{"titre":"string","date":"string","participants_direction":["string"],"participants_cse":["string"],"ordre_du_jour":["string"],"sections":[{"titre":"string","resume_direction":"string","resume_cse":"string","discussion":"string"}],"decisions":["string"],"conclusion":"string"}`;

const SINGLE_SYSTEM_PROMPT = `Tu es un rédacteur professionnel de procès-verbaux de réunions CSE (Comité Social et Économique).

À partir de la transcription fournie, produis un PV structuré en JSON.

RÈGLES :
- Distingue les interventions de la Direction vs les représentants CSE
- Résume les propos (pas de verbatim)
- Identifie les points de l'ordre du jour, participants, décisions
- Ton formel et professionnel, synthétique mais complet

RÉPONDS UNIQUEMENT avec un objet JSON :
{"titre":"string","date":"string","participants_direction":["string"],"participants_cse":["string"],"ordre_du_jour":["string"],"sections":[{"titre":"string","resume_direction":"string","resume_cse":"string","discussion":"string"}],"decisions":["string"],"conclusion":"string"}`;

export class OllamaService {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.httpGet('/api/tags');
      return response.statusCode === 200;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await this.httpGet('/api/tags');
      if (response.statusCode !== 200) return [];
      const data = JSON.parse(response.body);
      return (data.models || []).map((m: any) => ({
        name: m.name,
        size: m.size,
        details: m.details || { family: '', parameter_size: '' },
      }));
    } catch {
      return [];
    }
  }

  async generatePV(
    transcription: string,
    modelName: string,
    onProgress?: (text: string) => void
  ): Promise<PVContent> {
    console.log(`[ollama] Generating PV with model: ${modelName}`);
    console.log(`[ollama] Transcription length: ${transcription.length} chars`);

    if (transcription.length <= CHUNK_THRESHOLD) {
      // Short transcription: single-pass analysis
      return this.singlePassAnalysis(transcription, modelName, onProgress);
    } else {
      // Long transcription: chunked analysis + merge
      return this.chunkedAnalysis(transcription, modelName, onProgress);
    }
  }

  /**
   * Single-pass analysis for short transcriptions.
   */
  private async singlePassAnalysis(
    transcription: string,
    modelName: string,
    onProgress?: (text: string) => void
  ): Promise<PVContent> {
    onProgress?.('Analyse de la transcription...');

    const userPrompt = `Voici la transcription de la réunion CSE :\n\n${transcription}`;
    const responseText = await this.chat(modelName, SINGLE_SYSTEM_PROMPT, userPrompt, (text) => {
      onProgress?.(`Analyse en cours... (${text.length} caractères générés)`);
    });

    return this.parseJsonResponse(responseText);
  }

  /**
   * Chunked analysis for long transcriptions.
   * 1. Split into chunks
   * 2. Analyze each chunk independently
   * 3. Merge all chunk results into a final PV
   */
  private async chunkedAnalysis(
    transcription: string,
    modelName: string,
    onProgress?: (text: string) => void
  ): Promise<PVContent> {
    const chunks = this.splitIntoChunks(transcription);
    console.log(`[ollama] Split into ${chunks.length} chunks`);
    onProgress?.(`Transcription longue : découpage en ${chunks.length} parties...`);

    // Analyze each chunk
    const chunkResults: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkNum = i + 1;
      onProgress?.(`Analyse partie ${chunkNum}/${chunks.length}...`);
      console.log(`[ollama] Analyzing chunk ${chunkNum}/${chunks.length} (${chunks[i].length} chars)`);

      const userPrompt = `Voici la PARTIE ${chunkNum}/${chunks.length} de la transcription de la réunion CSE :\n\n${chunks[i]}`;
      const result = await this.chat(modelName, CHUNK_SYSTEM_PROMPT, userPrompt, (text) => {
        onProgress?.(`Analyse partie ${chunkNum}/${chunks.length}... (${text.length} car. générés)`);
      });

      chunkResults.push(result);
      console.log(`[ollama] Chunk ${chunkNum} done, response length: ${result.length}`);
    }

    // Merge all results
    onProgress?.(`Synthèse des ${chunks.length} parties en un PV unique...`);
    console.log(`[ollama] Merging ${chunkResults.length} chunk results`);

    const mergePrompt = `Voici les analyses partielles de la réunion CSE (${chunkResults.length} parties) :\n\n` +
      chunkResults.map((r, i) => `=== PARTIE ${i + 1} ===\n${r}`).join('\n\n');

    const mergedText = await this.chat(modelName, MERGE_SYSTEM_PROMPT, mergePrompt, (text) => {
      onProgress?.(`Synthèse en cours... (${text.length} car. générés)`);
    });

    return this.parseJsonResponse(mergedText);
  }

  /**
   * Split transcription into chunks at paragraph/sentence boundaries.
   */
  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= CHUNK_MAX_CHARS) {
        chunks.push(remaining);
        break;
      }

      // Find a good split point near CHUNK_MAX_CHARS
      let splitAt = CHUNK_MAX_CHARS;

      // Try to split at a double newline (paragraph boundary)
      const doubleNewline = remaining.lastIndexOf('\n\n', splitAt);
      if (doubleNewline > CHUNK_MAX_CHARS * 0.5) {
        splitAt = doubleNewline + 2;
      } else {
        // Try single newline
        const singleNewline = remaining.lastIndexOf('\n', splitAt);
        if (singleNewline > CHUNK_MAX_CHARS * 0.5) {
          splitAt = singleNewline + 1;
        } else {
          // Try sentence boundary (. or ?)
          const sentence = remaining.lastIndexOf('. ', splitAt);
          if (sentence > CHUNK_MAX_CHARS * 0.5) {
            splitAt = sentence + 2;
          }
          // Otherwise just split at CHUNK_MAX_CHARS
        }
      }

      chunks.push(remaining.substring(0, splitAt));
      remaining = remaining.substring(splitAt);
    }

    return chunks;
  }

  /**
   * Parse a JSON response from the model, with fallbacks.
   */
  private parseJsonResponse(responseText: string): PVContent {
    let jsonStr = responseText.trim();

    // Remove markdown code block if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
    }

    console.log(`[ollama] Response first 300 chars: ${jsonStr.substring(0, 300)}`);

    // Try direct parse
    try {
      const parsed = JSON.parse(jsonStr);
      return this.validatePVContent(parsed);
    } catch (e: any) {
      console.error('[ollama] Direct parse failed:', e.message);
    }

    // Try to extract the largest JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return this.validatePVContent(parsed);
      } catch (e2: any) {
        console.error('[ollama] Extracted JSON parse failed:', e2.message);
      }
    }

    const preview = jsonStr.substring(0, 200);
    throw new Error(
      `Le modèle n'a pas renvoyé du JSON valide.\n\n` +
      `Début de la réponse : "${preview}"\n\n` +
      `Essayez avec un modèle plus performant (ex: mistral:7b, llama3.2:3b).`
    );
  }

  private validatePVContent(data: any): PVContent {
    return {
      titre: data.titre || 'Réunion CSE',
      date: data.date || new Date().toLocaleDateString('fr-FR'),
      participants_direction: Array.isArray(data.participants_direction) ? data.participants_direction : [],
      participants_cse: Array.isArray(data.participants_cse) ? data.participants_cse : [],
      ordre_du_jour: Array.isArray(data.ordre_du_jour) ? data.ordre_du_jour : [],
      sections: Array.isArray(data.sections)
        ? data.sections.map((s: any) => ({
            titre: s.titre || 'Point',
            resume_direction: s.resume_direction || '',
            resume_cse: s.resume_cse || '',
            discussion: s.discussion || '',
          }))
        : Array.isArray(data.points_abordes)
          ? data.points_abordes.map((s: any) => ({
              titre: s.titre || 'Point',
              resume_direction: s.resume_direction || '',
              resume_cse: s.resume_cse || '',
              discussion: s.discussion || '',
            }))
          : [],
      decisions: Array.isArray(data.decisions) ? data.decisions : [],
      conclusion: data.conclusion || '',
    };
  }

  private chat(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    onProgress?: (text: string) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: true,
        format: 'json',
        options: {
          temperature: 0.3,
          num_predict: 8192,
          num_ctx: 24576,
        },
      });

      const url = new URL(this.baseUrl);
      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 11434,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 600000, // 10 min timeout per request
      };

      const req = http.request(options, (res) => {
        if (res.statusCode !== 200) {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            reject(new Error(`Ollama a répondu avec le code ${res.statusCode}: ${body}`));
          });
          return;
        }

        let fullResponse = '';
        let buffer = '';

        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();

          // Process complete JSON lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              if (data.message?.content) {
                fullResponse += data.message.content;
                onProgress?.(fullResponse);
              }
              if (data.done) {
                resolve(fullResponse);
                return;
              }
            } catch {
              // Partial JSON, continue
            }
          }
        });

        res.on('end', () => {
          // Process remaining buffer
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer);
              if (data.message?.content) {
                fullResponse += data.message.content;
              }
            } catch {
              // ignore
            }
          }
          resolve(fullResponse);
        });

        res.on('error', reject);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout: Ollama n\'a pas répondu dans le délai imparti (10 min). Essayez un modèle plus léger.'));
      });

      req.on('error', (err) => {
        if (err.message.includes('ECONNREFUSED')) {
          reject(new Error('Impossible de se connecter à Ollama. Le serveur embarqué n\'est peut-être pas encore prêt.'));
        } else {
          reject(err);
        }
      });

      req.write(payload);
      req.end();
    });
  }

  private httpGet(urlPath: string): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl);
      http.get({
        hostname: url.hostname,
        port: url.port || 11434,
        path: urlPath,
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, body }));
        res.on('error', reject);
      }).on('error', reject);
    });
  }
}
