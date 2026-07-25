async function manipulatePdf(
  sourceBlob: GoogleAppsScript.Base.Blob,
  data: ParsedData,
  newFileName: string,
  stampSubmittalNo: string,
  templateId: string
): Promise<GoogleAppsScript.Base.Blob> {
  return defaultPdfDocumentService.stampSubmittal(sourceBlob, data, {
    newFileName,
    stampSubmittalNo,
    templateId
  });
}
