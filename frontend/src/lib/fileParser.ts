import ExcelJS from 'exceljs';
import { ContactRow } from '@/types/dispatcher';
import { FileParseError, getErrorMessage, getErrorDetails } from './errors';

export interface ParseResult {
  success: boolean;
  data?: ContactRow[];
  error?: string;
  errorCode?: string;
  details?: {
    totalRows?: number;
    validRows?: number;
    invalidRows?: number;
  };
}

function sanitizePhone(phone: string): string {
  let cleaned = String(phone).replace(/\D/g, '');
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/** Parse CSV text into array of objects (first row = headers). */
function parseCsvToJson(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if ((c === ',' || c === ';') && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map((h) => h.replace(/^"|"$/g, '').trim());
  const jsonData: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = (values[j] ?? '').replace(/^"|"$/g, '').trim();
    });
    jsonData.push(row);
  }
  return jsonData;
}

function processJsonDataToContacts(
  jsonData: Record<string, string>[],
  empresaCol: string,
  telefoneCol: string
): { contacts: ContactRow[]; invalidRows: number } {
  const allContacts: ContactRow[] = [];
  let invalidRows = 0;
  jsonData.forEach((row) => {
    const telefoneRaw = String(row[telefoneCol] ?? '').trim();
    const empresa = String(row[empresaCol] ?? '').trim();
    const telefoneFormatado = sanitizePhone(telefoneRaw);
    if (!empresa || !telefoneFormatado || telefoneFormatado.length < 12) {
      invalidRows++;
      return;
    }
    allContacts.push({
      id: generateId(),
      empresa,
      telefone: telefoneRaw,
      telefoneFormatado,
      mensagemIA: '',
      status: 'pendente' as const,
    });
  });
  return { contacts: allContacts, invalidRows };
}

function resolveResult(
  allContacts: ContactRow[],
  jsonData: Record<string, string>[],
  invalidRows: number
): ParseResult {
  if (allContacts.length === 0) {
    return {
      success: false,
      error:
        'Nenhum contato válido encontrado no arquivo. Verifique se as colunas "Empresa" e "Telefone" contêm dados válidos.',
      errorCode: 'NO_VALID_CONTACTS',
      details: {
        totalRows: jsonData.length,
        validRows: 0,
        invalidRows,
      },
    };
  }
  return {
    success: true,
    data: allContacts,
    details: {
      totalRows: jsonData.length,
      validRows: allContacts.length,
      invalidRows,
    },
  };
}

export function parseFile(file: File): Promise<ParseResult> {
  const validExtensions = ['.xlsx', '.csv'];
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

  if (!validExtensions.includes(fileExtension)) {
    return Promise.resolve({
      success: false,
      error: `Tipo de arquivo não suportado. Use: ${validExtensions.join(', ')}`,
      errorCode: 'INVALID_FILE_TYPE',
    });
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return Promise.resolve({
      success: false,
      error: `Arquivo muito grande. Tamanho máximo: 10MB. Tamanho atual: ${(file.size / 1024 / 1024).toFixed(2)}MB`,
      errorCode: 'FILE_TOO_LARGE',
    });
  }

  if (file.size === 0) {
    return Promise.resolve({
      success: false,
      error: 'O arquivo está vazio.',
      errorCode: 'EMPTY_FILE',
    });
  }

  if (fileExtension === '.csv') {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string | undefined;
          if (!text) {
            resolve({ success: false, error: 'Não foi possível ler o arquivo.', errorCode: 'READ_ERROR' });
            return;
          }
          const jsonData = parseCsvToJson(text);
          if (jsonData.length === 0) {
            resolve({
              success: false,
              error: 'O arquivo está vazio ou não contém dados.',
              errorCode: 'EMPTY_FILE',
            });
            return;
          }
          const firstRow = jsonData[0];
          const columns = Object.keys(firstRow).map((col) => col.toLowerCase());
          const hasEmpresa = columns.some((col) => col === 'empresa');
          const hasTelefone = columns.some((col) => col === 'telefone');
          if (!hasEmpresa || !hasTelefone) {
            const missing = [];
            if (!hasEmpresa) missing.push('Empresa');
            if (!hasTelefone) missing.push('Telefone');
            resolve({
              success: false,
              error: `Colunas obrigatórias não encontradas: ${missing.join(', ')}. O arquivo deve conter as colunas "Empresa" e "Telefone".`,
              errorCode: 'MISSING_COLUMNS',
              details: { totalRows: jsonData.length },
            });
            return;
          }
          const empresaCol = Object.keys(firstRow).find((col) => col.toLowerCase() === 'empresa')!;
          const telefoneCol = Object.keys(firstRow).find((col) => col.toLowerCase() === 'telefone')!;
          const { contacts, invalidRows } = processJsonDataToContacts(jsonData, empresaCol, telefoneCol);
          resolve(resolveResult(contacts, jsonData, invalidRows));
        } catch (err) {
          const msg = getErrorMessage(err);
          resolve({ success: false, error: msg, errorCode: 'PARSE_ERROR' });
        }
      };
      reader.onerror = () =>
        resolve({
          success: false,
          error: 'Erro ao ler o arquivo.',
          errorCode: 'READ_ERROR',
        });
      reader.readAsText(file, 'UTF-8');
    });
  }

  // .xlsx with ExcelJS
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!data || !(data instanceof ArrayBuffer)) {
          resolve({ success: false, error: 'Não foi possível ler o conteúdo do arquivo.', errorCode: 'READ_ERROR' });
          return;
        }
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(data);
        if (!workbook.worksheets || workbook.worksheets.length === 0) {
          resolve({ success: false, error: 'O arquivo não contém planilhas válidas.', errorCode: 'PARSE_ERROR' });
          return;
        }
        const worksheet = workbook.worksheets[0];
        const headerRow = worksheet.getRow(1);
        const values = headerRow.values as (ExcelJS.CellValue | undefined)[];
        const headers = (values?.slice(1) ?? []).map((v) => String(v ?? '').trim()).filter(Boolean);
        if (headers.length === 0) {
          resolve({ success: false, error: 'O arquivo está vazio ou não contém cabeçalhos.', errorCode: 'EMPTY_FILE' });
          return;
        }
        const columns = headers.map((h) => h.toLowerCase());
        const hasEmpresa = columns.some((c) => c === 'empresa');
        const hasTelefone = columns.some((c) => c === 'telefone');
        if (!hasEmpresa || !hasTelefone) {
          const missing = [];
          if (!hasEmpresa) missing.push('Empresa');
          if (!hasTelefone) missing.push('Telefone');
          resolve({
            success: false,
            error: `Colunas obrigatórias não encontradas: ${missing.join(', ')}. O arquivo deve conter as colunas "Empresa" e "Telefone".`,
            errorCode: 'MISSING_COLUMNS',
          });
          return;
        }
        const empresaCol = headers.find((h) => h.toLowerCase() === 'empresa')!;
        const telefoneCol = headers.find((h) => h.toLowerCase() === 'telefone')!;
        const jsonData: Record<string, string>[] = [];
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          const rowValues = row.values as (ExcelJS.CellValue | undefined)[];
          const rowObj: Record<string, string> = {};
          headers.forEach((h, i) => {
            const v = rowValues?.[i + 1];
            rowObj[h] = v != null ? String(v).trim() : '';
          });
          jsonData.push(rowObj);
        });
        if (jsonData.length === 0) {
          resolve({
            success: false,
            error: 'O arquivo está vazio ou não contém dados.',
            errorCode: 'EMPTY_FILE',
          });
          return;
        }
        const { contacts, invalidRows } = processJsonDataToContacts(jsonData, empresaCol, telefoneCol);
        resolve(resolveResult(contacts, jsonData, invalidRows));
      } catch (error) {
        const errorDetails = getErrorDetails(error);
        console.error('File parse error:', errorDetails);
        const errorMessage =
          error instanceof FileParseError
            ? error.message
            : 'Erro ao processar o arquivo. Verifique se é um arquivo Excel (.xlsx) ou CSV válido.';
        resolve({
          success: false,
          error: errorMessage,
          errorCode: error instanceof FileParseError ? error.code : 'PARSE_ERROR',
        });
      }
    };
    reader.onerror = () =>
      resolve({
        success: false,
        error: 'Erro ao ler o arquivo. Verifique se o arquivo não está corrompido ou protegido.',
        errorCode: 'READ_ERROR',
      });
    reader.readAsArrayBuffer(file);
  });
}
