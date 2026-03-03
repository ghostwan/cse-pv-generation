import fs from 'fs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import type { PVContent } from './ollama';

/**
 * Generates a Word document from structured PV content.
 * 
 * Two modes:
 * 1. With template: Uses the template's styles/layout as base, clears its body,
 *    and injects PV content programmatically.
 * 2. Without template: Builds a standalone .docx from scratch using docxtemplater
 *    with a minimal built-in template.
 */
export class DocumentGenerator {
  /**
   * Legacy method — generate from template + placeholder data.
   * Kept for backward compatibility but no longer the primary path.
   */
  async generate(
    templatePath: string,
    data: Record<string, any>,
    outputPath: string
  ): Promise<void> {
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template introuvable: ${templatePath}`);
    }

    console.log('[docgen] Generating document from template:', templatePath);
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter() { return ''; },
    });

    try {
      doc.render(data);
    } catch (error: any) {
      console.error('[docgen] Render error:', error.message);
      throw new Error(`Erreur lors de la generation du document: ${error.message}`);
    }

    const output = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
    fs.writeFileSync(outputPath, output);
  }

  /**
   * Primary method — generates a PV Word document from structured PVContent.
   * Uses a docxtemplater template with the PV structure built in.
   */
  async generateFromPV(
    pvContent: PVContent,
    outputPath: string,
    templatePath?: string
  ): Promise<void> {
    console.log('[docgen] Generating PV document');
    console.log('[docgen] Title:', pvContent.titre);
    console.log('[docgen] Sections:', pvContent.sections.length);

    // Build the template string for docxtemplater
    const templateXml = this.buildPVTemplate();

    // Create a minimal .docx with our template
    const zip = this.createMinimalDocx(templateXml);

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter() { return ''; },
    });

    // Prepare data for the template
    const data = {
      titre: pvContent.titre,
      date: pvContent.date,
      participants_direction: pvContent.participants_direction.join(', ') || 'Non identifie(s)',
      participants_cse: pvContent.participants_cse.join(', ') || 'Non identifie(s)',
      ordre_du_jour: pvContent.ordre_du_jour.map(item => ({ item })),
      sections: pvContent.sections.map(s => ({
        titre: s.titre,
        resume_direction: s.resume_direction,
        resume_cse: s.resume_cse,
        discussion: s.discussion,
      })),
      decisions: pvContent.decisions.map(item => ({ item })),
      conclusion: pvContent.conclusion,
    };

    try {
      doc.render(data);
    } catch (error: any) {
      console.error('[docgen] Render error:', error.message);
      if (error.properties?.errors) {
        for (const err of error.properties.errors) {
          console.error('[docgen]  -', err.message);
        }
      }
      throw new Error(`Erreur lors de la generation du PV: ${error.message}`);
    }

    const output = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
    fs.writeFileSync(outputPath, output);
    console.log('[docgen] PV saved to:', outputPath);
  }

  /**
   * Builds the document.xml content with PV structure.
   * Uses Word XML with styles for professional formatting.
   */
  private buildPVTemplate(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:w10="urn:schemas-microsoft-com:office:word"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
            xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
            xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
            xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
            xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
            mc:Ignorable="w14 wp14">
  <w:body>
    <!-- Title -->
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:after="200"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="48"/><w:szCs w:val="48"/><w:color w:val="1F4E79"/></w:rPr>
        <w:t xml:space="preserve">PROCES-VERBAL</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:after="100"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/><w:color w:val="2E75B6"/></w:rPr>
        <w:t xml:space="preserve">{titre}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:after="400"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="808080"/></w:rPr>
        <w:t xml:space="preserve">{date}</w:t>
      </w:r>
    </w:p>

    <!-- Separator -->
    <w:p>
      <w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="2E75B6"/></w:pBdr><w:spacing w:after="300"/></w:pPr>
    </w:p>

    <!-- Participants -->
    <w:p>
      <w:pPr><w:spacing w:after="100"/></w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="1F4E79"/></w:rPr>
        <w:t xml:space="preserve">PARTICIPANTS</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:spacing w:after="60"/></w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
        <w:t xml:space="preserve">Direction : </w:t>
      </w:r>
      <w:r>
        <w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
        <w:t xml:space="preserve">{participants_direction}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:spacing w:after="300"/></w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
        <w:t xml:space="preserve">Representants CSE : </w:t>
      </w:r>
      <w:r>
        <w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
        <w:t xml:space="preserve">{participants_cse}</w:t>
      </w:r>
    </w:p>

    <!-- Ordre du jour -->
    <w:p>
      <w:pPr><w:spacing w:after="100"/></w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="1F4E79"/></w:rPr>
        <w:t xml:space="preserve">ORDRE DU JOUR</w:t>
      </w:r>
    </w:p>
    {#ordre_du_jour}
    <w:p>
      <w:pPr>
        <w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>
        <w:spacing w:after="40"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
        <w:t xml:space="preserve">{item}</w:t>
      </w:r>
    </w:p>
    {/ordre_du_jour}
    <w:p><w:pPr><w:spacing w:after="300"/></w:pPr></w:p>

    <!-- Sections -->
    {#sections}
    <w:p>
      <w:pPr>
        <w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BDD7EE"/></w:pBdr>
        <w:spacing w:after="100"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/><w:color w:val="2E75B6"/></w:rPr>
        <w:t xml:space="preserve">{titre}</w:t>
      </w:r>
    </w:p>

    <w:p>
      <w:pPr><w:spacing w:after="40"/></w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="C00000"/></w:rPr>
        <w:t xml:space="preserve">Position de la Direction :</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:spacing w:after="100"/><w:ind w:left="360"/></w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
        <w:t xml:space="preserve">{resume_direction}</w:t>
      </w:r>
    </w:p>

    <w:p>
      <w:pPr><w:spacing w:after="40"/></w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="006600"/></w:rPr>
        <w:t xml:space="preserve">Position du CSE :</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:spacing w:after="100"/><w:ind w:left="360"/></w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
        <w:t xml:space="preserve">{resume_cse}</w:t>
      </w:r>
    </w:p>

    <w:p>
      <w:pPr><w:spacing w:after="40"/></w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="404040"/></w:rPr>
        <w:t xml:space="preserve">Echanges :</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:spacing w:after="300"/><w:ind w:left="360"/></w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/><w:i/></w:rPr>
        <w:t xml:space="preserve">{discussion}</w:t>
      </w:r>
    </w:p>
    {/sections}

    <!-- Decisions -->
    <w:p>
      <w:pPr>
        <w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="2E75B6"/></w:pBdr>
        <w:spacing w:after="100"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="1F4E79"/></w:rPr>
        <w:t xml:space="preserve">DECISIONS PRISES</w:t>
      </w:r>
    </w:p>
    {#decisions}
    <w:p>
      <w:pPr>
        <w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>
        <w:spacing w:after="40"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
        <w:t xml:space="preserve">{item}</w:t>
      </w:r>
    </w:p>
    {/decisions}
    <w:p><w:pPr><w:spacing w:after="300"/></w:pPr></w:p>

    <!-- Conclusion -->
    <w:p>
      <w:pPr><w:spacing w:after="100"/></w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="1F4E79"/></w:rPr>
        <w:t xml:space="preserve">CONCLUSION</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:spacing w:after="200"/></w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
        <w:t xml:space="preserve">{conclusion}</w:t>
      </w:r>
    </w:p>

    <!-- Footer -->
    <w:p>
      <w:pPr>
        <w:pBdr><w:top w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr>
        <w:jc w:val="center"/>
        <w:spacing w:before="400"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="808080"/><w:i/></w:rPr>
        <w:t xml:space="preserve">Document genere automatiquement - CSE PV Generation</w:t>
      </w:r>
    </w:p>

    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  }

  /**
   * Creates a minimal valid .docx file as a PizZip archive.
   * A .docx is just a ZIP file with specific XML files inside.
   */
  private createMinimalDocx(documentXml: string): PizZip {
    const zip = new PizZip();

    // [Content_Types].xml
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`);

    // _rels/.rels
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    // word/_rels/document.xml.rels
    zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`);

    // word/numbering.xml — needed for bullet lists
    zip.file('word/numbering.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="\u2022"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
      <w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1">
    <w:abstractNumId w:val="0"/>
  </w:num>
</w:numbering>`);

    // word/document.xml — the actual content
    zip.file('word/document.xml', documentXml);

    return zip;
  }
}
