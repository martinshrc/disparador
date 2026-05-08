import ExcelJS from 'exceljs';

/**
 * Exporta um array de objetos para arquivo .xlsx e dispara o download no navegador.
 * @param data Array de objetos (chaves = cabeçalhos da planilha)
 * @param sheetName Nome da aba
 * @param fileName Nome do arquivo (ex: relatorio.xlsx)
 */
export async function exportToXlsx(
  data: Record<string, string | number>[],
  sheetName: string,
  fileName: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, { headerRow: true });
  if (data.length === 0) {
    sheet.addRow([]);
  } else {
    const headers = Object.keys(data[0]);
    sheet.addRow(headers);
    data.forEach((row) => sheet.addRow(headers.map((h) => row[h] ?? '')));
    headers.forEach((_, i) => {
      const col = sheet.getColumn(i + 1);
      col.width = 18;
    });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
