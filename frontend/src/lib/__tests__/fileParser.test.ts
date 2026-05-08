import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseFile } from '../fileParser';

describe('parseFile', () => {
  let mockFileReader: {
    readAsText: (file: File, encoding?: string) => void;
    readAsArrayBuffer: (file: File) => void;
    onload: ((e: { target: { result: string | ArrayBuffer } }) => void) | null;
    onerror: (() => void) | null;
  };

  beforeEach(() => {
    mockFileReader = {
      readAsText: vi.fn(),
      readAsArrayBuffer: vi.fn(),
      onload: null,
      onerror: null,
    };

    global.FileReader = vi.fn(function FileReaderMock() {
      return mockFileReader;
    }) as unknown as typeof FileReader;
  });

  it('deve rejeitar arquivo com extensão inválida', async () => {
    const invalidFile = new File([''], 'test.pdf');
    Object.defineProperty(invalidFile, 'size', { value: 1024 });

    const result = await parseFile(invalidFile);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Tipo de arquivo não suportado');
    expect(result.errorCode).toBe('INVALID_FILE_TYPE');
  });

  it('deve rejeitar arquivo .xls (formato antigo não suportado)', async () => {
    const xlsFile = new File([''], 'test.xls');
    Object.defineProperty(xlsFile, 'size', { value: 1024 });

    const result = await parseFile(xlsFile);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Tipo de arquivo não suportado');
  });

  it('deve rejeitar arquivo muito grande', async () => {
    const largeFile = new File([''], 'test.xlsx');
    Object.defineProperty(largeFile, 'size', { value: 11 * 1024 * 1024 }); // 11MB

    const result = await parseFile(largeFile);

    expect(result.success).toBe(false);
    expect(result.error).toContain('muito grande');
    expect(result.errorCode).toBe('FILE_TOO_LARGE');
  });

  it('deve rejeitar arquivo vazio', async () => {
    const emptyFile = new File([''], 'test.xlsx');
    Object.defineProperty(emptyFile, 'size', { value: 0 });

    const result = await parseFile(emptyFile);

    expect(result.success).toBe(false);
    expect(result.error).toContain('vazio');
    expect(result.errorCode).toBe('EMPTY_FILE');
  });

  const triggerCsvLoad = (csvContent: string) => {
    if (mockFileReader.onload) {
      mockFileReader.onload({ target: { result: csvContent } } as unknown as ProgressEvent<FileReader>);
    }
  };

  it('deve processar CSV válido com sucesso', async () => {
    const csvFile = new File(['Empresa,Telefone\nEmpresa 1,11999999999\nEmpresa 2,11888888888'], 'test.csv', {
      type: 'text/csv',
    });
    Object.defineProperty(csvFile, 'size', { value: 1024 });

    const resultPromise = parseFile(csvFile);
    triggerCsvLoad('Empresa,Telefone\nEmpresa 1,11999999999\nEmpresa 2,11888888888');

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.length).toBe(2);
    expect(result.data?.[0].empresa).toBe('Empresa 1');
    expect(result.data?.[0].telefoneFormatado).toContain('55');
  });

  it('deve rejeitar CSV sem colunas obrigatórias', async () => {
    const csvFile = new File(['Nome,Email\nJoão,email@test.com'], 'test.csv');
    Object.defineProperty(csvFile, 'size', { value: 1024 });

    const resultPromise = parseFile(csvFile);
    triggerCsvLoad('Nome,Email\nJoão,email@test.com');

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error).toContain('Colunas obrigatórias não encontradas');
    expect(result.errorCode).toBe('MISSING_COLUMNS');
  });

  it('deve filtrar linhas inválidas no CSV', async () => {
    const csvFile = new File(
      ['Empresa,Telefone\nEmpresa 1,11999999999\n,11888888888\nEmpresa 3,123\nEmpresa 4,11977777777'],
      'test.csv'
    );
    Object.defineProperty(csvFile, 'size', { value: 1024 });

    const resultPromise = parseFile(csvFile);
    triggerCsvLoad(
      'Empresa,Telefone\nEmpresa 1,11999999999\n,11888888888\nEmpresa 3,123\nEmpresa 4,11977777777'
    );

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.data?.length).toBe(2); // Apenas 2 válidos
    expect(result.details?.invalidRows).toBe(2);
    expect(result.details?.validRows).toBe(2);
  });

  it('deve formatar telefone com código do país no CSV', async () => {
    const csvFile = new File(['Empresa,Telefone\nE1,11999999999\nE2,5511888888888'], 'test.csv');
    Object.defineProperty(csvFile, 'size', { value: 1024 });

    const resultPromise = parseFile(csvFile);
    triggerCsvLoad('Empresa,Telefone\nE1,11999999999\nE2,5511888888888');

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.data?.[0].telefoneFormatado).toMatch(/^55/);
    expect(result.data?.[1].telefoneFormatado).toMatch(/^55/);
  });

  it('deve lidar com erro de leitura do arquivo (CSV)', async () => {
    const csvFile = new File([''], 'test.csv');
    Object.defineProperty(csvFile, 'size', { value: 1024 });

    const resultPromise = parseFile(csvFile);

    if (mockFileReader.onerror) {
      mockFileReader.onerror(new Event('error') as unknown as ProgressEvent<FileReader>);
    }

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error).toContain('Erro ao ler o arquivo');
    expect(result.errorCode).toBe('READ_ERROR');
  });

  it('deve aceitar arquivos CSV', async () => {
    const csvFile = new File(['Empresa,Telefone\nEmpresa 1,11999999999'], 'test.csv');
    Object.defineProperty(csvFile, 'size', { value: 1024 });

    const resultPromise = parseFile(csvFile);
    triggerCsvLoad('Empresa,Telefone\nEmpresa 1,11999999999');

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.data?.length).toBe(1);
  });
});
