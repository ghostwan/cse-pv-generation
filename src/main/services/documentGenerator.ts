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

    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter() {
        return '';
      },
    });

    // Set the data to fill placeholders
    doc.setData(data);

    try {
      doc.render();
    } catch (error: any) {
      const e = {
        message: error.message,
        properties: error.properties,
      };
      throw new Error(`Erreur lors de la génération du document: ${e.message}`);
    }

    const output = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    fs.writeFileSync(outputPath, output);
  }
}
