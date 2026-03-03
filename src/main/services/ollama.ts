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

const SYSTEM_PROMPT = `Tu es un rédacteur professionnel de procès-verbaux de réunions CSE (Comité Social et Économique).

À partir de la transcription fournie, produis un PV structuré en JSON.

RÈGLES :
- Distingue les interventions de la Direction vs les représentants CSE
- Résume les propos (pas de verbatim)
- Identifie les points de l'ordre du jour, participants, décisions
- Ton formel et professionnel, synthétique mais complet

RÉPONDS UNIQUEMENT avec un objet JSON ayant cette structure :
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
    const userPrompt = `Voici la transcription brute de la réunion CSE :\n\n${transcription}`;

    console.log(`[ollama] Generating PV with model: ${modelName}`);
    console.log(`[ollama] Transcription length: ${transcription.length} chars`);

    const responseText = await this.chat(modelName, SYSTEM_PROMPT, userPrompt, onProgress);

    console.log(`[ollama] Response length: ${responseText.length} chars`);

    // Parse JSON from response
    let jsonStr = responseText.trim();

    // Remove markdown code block if present (some models still wrap)
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
    }

    console.log(`[ollama] Response first 300 chars: ${jsonStr.substring(0, 300)}`);

    // Try direct parse first
    try {
      const parsed = JSON.parse(jsonStr);
      return this.validatePVContent(parsed);
    } catch (e: any) {
      console.error('[ollama] Direct parse failed:', e.message);
    }

    // Try to extract the largest JSON object from the response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return this.validatePVContent(parsed);
      } catch (e2: any) {
        console.error('[ollama] Extracted JSON parse failed:', e2.message);
      }
    }

    // All parsing failed
    const preview = jsonStr.substring(0, 200);
    throw new Error(
      `Le modèle n'a pas renvoyé du JSON valide.\n\n` +
      `Début de la réponse : "${preview}"\n\n` +
      `Essayez avec un modèle plus performant (ex: llama3.2:3b, mistral:7b).`
    );
  }

  private validatePVContent(data: any): PVContent {
    return {
      titre: data.titre || 'Réunion CSE',
      date: data.date || new Date().toLocaleDateString('fr-FR'),
      participants_direction: Array.isArray(data.participants_direction) ? data.participants_direction : [],
      participants_cse: Array.isArray(data.participants_cse) ? data.participants_cse : [],
      ordre_du_jour: Array.isArray(data.ordre_du_jour) ? data.ordre_du_jour : [],
      sections: Array.isArray(data.sections) ? data.sections.map((s: any) => ({
        titre: s.titre || 'Point',
        resume_direction: s.resume_direction || '',
        resume_cse: s.resume_cse || '',
        discussion: s.discussion || '',
      })) : [],
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
          num_predict: 16384,
          num_ctx: 32768,
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

      req.on('error', (err) => {
        if (err.message.includes('ECONNREFUSED')) {
          reject(new Error('Impossible de se connecter à Ollama. Vérifiez qu\'Ollama est lancé (ollama serve).'));
        } else {
          reject(err);
        }
      });

      req.write(payload);
      req.end();
    });
  }

  private httpGet(path: string): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl);
      http.get({
        hostname: url.hostname,
        port: url.port || 11434,
        path,
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, body }));
        res.on('error', reject);
      }).on('error', reject);
    });
  }
}
