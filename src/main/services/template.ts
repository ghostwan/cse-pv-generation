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
      delimiters: { start: '{', end: '}' },
    });

    // Extract all tags/placeholders from the template
    const tags = doc.getFullText();
    const placeholderRegex = /\{([^}]+)\}/g;
    const placeholders: Set<string> = new Set();

    // Also parse the raw XML to find all placeholders
    const xmlFiles = ['word/document.xml', 'word/header1.xml', 'word/header2.xml', 'word/footer1.xml', 'word/footer2.xml'];
    
    for (const xmlFile of xmlFiles) {
      try {
        const xmlContent = zip.file(xmlFile)?.asText();
        if (xmlContent) {
          // Match simple placeholders {placeholder}
          let match;
          const simpleRegex = /\{([^}#/]+)\}/g;
          while ((match = simpleRegex.exec(xmlContent)) !== null) {
            const placeholder = match[1].trim();
            if (placeholder && !placeholder.startsWith('w:') && !placeholder.startsWith('xml')) {
              placeholders.add(placeholder);
            }
          }

          // Match loop placeholders {#items}...{/items}
          const loopRegex = /\{#([^}]+)\}/g;
          while ((match = loopRegex.exec(xmlContent)) !== null) {
            placeholders.add(`#${match[1].trim()}`);
          }
        }
      } catch {
        // File might not exist in the template
      }
    }

    return Array.from(placeholders);
  }
}
