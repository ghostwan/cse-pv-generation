import fs from 'fs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

export interface TemplateInfo {
  path: string;
  name: string;
  placeholders: string[];
  size: number;
}

export class TemplateService {
  async loadTemplate(filePath: string): Promise<TemplateInfo> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Fichier template introuvable: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    const placeholders = await this.getPlaceholders(filePath);
    const name = filePath.split(/[\\/]/).pop() || 'template.docx';

    return {
      path: filePath,
      name,
      placeholders,
      size: stats.size,
    };
  }

  async getPlaceholders(filePath: string): Promise<string[]> {
    const content = fs.readFileSync(filePath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Use getFullText() which resolves fragmented tags across XML elements
    // This handles cases where Word splits {placeholder} into
    // <w:t>{</w:t><w:t>placeholder</w:t><w:t>}</w:t>
    const fullText = doc.getFullText();
    const placeholders: Set<string> = new Set();

    // Simple placeholders {name}
    const simpleRegex = /\{([^}#/]+)\}/g;
    let match;
    while ((match = simpleRegex.exec(fullText)) !== null) {
      const tag = match[1].trim();
      if (tag) {
        placeholders.add(tag);
      }
    }

    // Loop placeholders {#items}...{/items}
    const loopRegex = /\{#([^}]+)\}/g;
    while ((match = loopRegex.exec(fullText)) !== null) {
      placeholders.add(`#${match[1].trim()}`);
    }

    return Array.from(placeholders);
  }
}
