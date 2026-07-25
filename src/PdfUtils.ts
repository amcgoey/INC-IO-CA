async function manipulatePdf(
  sourceBlob: GoogleAppsScript.Base.Blob,
  data: ParsedData,
  newFileName: string,
  stampSubmittalNo: string,
  templateId: string
): Promise<GoogleAppsScript.Base.Blob> {
  if (!templateId || templateId === "") throw new Error("TEMPLATE_MISSING");
  
  const setTimeout = (fn: Function) => { fn(); return 0; };
  eval(UrlFetchApp.fetch(CONFIG.PDF_LIB_URL).getContentText());
  const { PDFDocument } = PDFLib;
  
  const toUint8 = (b: GoogleAppsScript.Base.Blob): Uint8Array => { 
    let bytes = b.getBytes(), u = new Uint8Array(bytes.length); 
    for (let i = 0; i < bytes.length; i++) u[i] = bytes[i] & 0xFF; 
    return u; 
  };
  
  const pdfDoc = await PDFDocument.load(toUint8(DriveApp.getFileById(templateId).getAs(MimeType.PDF)));
  const form = pdfDoc.getForm();
  
  const fill = (names: string[], val: string) => { 
    for (let n of names) { 
      try { 
        let f = form.getTextField(n); 
        if (f) { f.setText(val); return; } 
      } catch (e) {} 
    } 
  };
  
  fill(['Submittal No', 'Submittal No.', 'Submittal Number'], stampSubmittalNo);
  
  const act = data.action ? String(data.action) : "";
  if (act) {
    try {
      let rg = form.getRadioGroup('Submittal Response'), opts = rg.getOptions();
      if (opts.includes(act)) rg.select(act);
      else if (opts.includes(act.toUpperCase())) rg.select(act.toUpperCase());
      else if (PDF_CHECKBOX_MAP[act] && opts.includes(PDF_CHECKBOX_MAP[act])) rg.select(PDF_CHECKBOX_MAP[act]);
    } catch (e) {
      let box = PDF_CHECKBOX_MAP[act] || (act ? PDF_CHECKBOX_MAP[act.toUpperCase()] : null);
      if (box) { 
        try { form.getCheckBox(box).check(); } catch(err) {} 
      }
    }
  }
  
  const sourcePdf = await PDFDocument.load(toUint8(sourceBlob));
  const copied = await pdfDoc.copyPages(sourcePdf, sourcePdf.getPageIndices());
  copied.forEach((p: any) => pdfDoc.addPage(p));
  
  return Utilities.newBlob(await pdfDoc.save(), 'application/pdf', newFileName + ".pdf");
}
