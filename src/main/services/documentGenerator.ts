import fs from 'fs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

export class DocumentGenerator {
  async generate(
    templatePath: string,
    data: Record<string, any>,
    outputPath: string
  ): Promise<void> {
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template introuvable: ${templatePath}`);
    }

    console.log('[docgen] Generating document from template:', templatePath);
    console.log('[docgen] Data keys:', Object.keys(data));
    console.log('[docgen] Output:', outputPath);

    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter() {
        return '';
      },
    });

    try {
      doc.render(data);
    } catch (error: any) {
      console.error('[docgen] Render error:', error.message);
      if (error.properties?.errors) {
        for (const err of error.properties.errors) {
          console.error('[docgen]  -', err.message);
        }
      }
      throw new Error(`Erreur lors de la génération du document: ${error.message}`);
    }

    const output = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    fs.writeFileSync(outputPath, output);

    // Verify the output
    const verifyContent = fs.readFileSync(outputPath, 'binary');
    const verifyZip = new PizZip(verifyContent);
    const verifyDoc = new Docxtemplater(verifyZip, { paragraphLoop: true, linebreaks: true });
    const verifyText = verifyDoc.getFullText();
    console.log('[docgen] Generated document text length:', verifyText.length);
    console.log('[docgen] First 200 chars:', verifyText.substring(0, 200));
  }
}
