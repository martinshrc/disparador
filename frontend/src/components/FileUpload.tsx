import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseFile, ParseResult } from "@/lib/fileParser";
import { ContactRow } from "@/types/dispatcher";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileLoaded: (contacts: ContactRow[]) => void;
  disabled?: boolean;
  /** Exibido enquanto os contatos estão sendo salvos no perfil do usuário (Supabase). */
  savingToProfile?: boolean;
}

export function FileUpload({ onFileLoaded, disabled, savingToProfile }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setSuccess(false);
      setFileName(file.name);

      try {
        const result: ParseResult = await parseFile(file);

        if (result.success && result.data) {
          setSuccess(true);
          onFileLoaded(result.data);
          
          // Mostra informações adicionais se disponíveis
          if (result.details && result.details.invalidRows && result.details.invalidRows > 0) {
            console.warn(
              `Arquivo processado: ${result.details.validRows} contatos válidos, ` +
              `${result.details.invalidRows} linhas inválidas foram ignoradas.`
            );
          }
        } else {
          // Mensagem de erro mais detalhada
          let errorMsg = result.error || "Erro desconhecido ao processar o arquivo";
          
          // Adiciona detalhes se disponíveis
          if (result.details) {
            const details = [];
            if (result.details.totalRows) details.push(`${result.details.totalRows} linhas no total`);
            if (result.details.validRows !== undefined) details.push(`${result.details.validRows} válidas`);
            if (result.details.invalidRows) details.push(`${result.details.invalidRows} inválidas`);
            
            if (details.length > 0) {
              errorMsg += ` (${details.join(', ')})`;
            }
          }
          
          setError(errorMsg);
        }
      } catch (error) {
        const errorMsg = error instanceof Error 
          ? error.message 
          : "Erro inesperado ao processar o arquivo";
        setError(errorMsg);
        console.error("Erro ao processar arquivo:", error);
      }
    },
    [onFileLoaded],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) return;

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile, disabled],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) {
        setIsDragging(true);
      }
    },
    [disabled],
  );

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Upload de Contatos
        </CardTitle>
        <CardDescription>
          Arraste um arquivo .xlsx ou .csv com as colunas &quot;Empresa&quot; e &quot;Telefone&quot;.
          Não tem planilha? <Link to="/coletar-leads" className="text-primary hover:underline font-medium">Coletar leads</Link> no Google Maps.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "relative border-2 border-dashed rounded-lg p-3 transition-all duration-200 text-center",
            isDragging && !disabled && !savingToProfile && "border-primary bg-primary/5 scale-[1.02]",
            !isDragging && !disabled && !savingToProfile && "border-border hover:border-primary/50 hover:bg-accent/50",
            (disabled || savingToProfile) && "opacity-50 cursor-not-allowed bg-muted",
            savingToProfile && "border-primary/50",
            success && !savingToProfile && "border-success bg-success/5",
            error && "border-destructive bg-destructive/5",
          )}
        >
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={handleInputChange}
            disabled={disabled || savingToProfile}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />

          <div className="flex flex-col items-center gap-2">
            {savingToProfile ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="font-medium text-foreground">Salvando no seu perfil...</p>
                <p className="text-sm text-muted-foreground">Os contatos estão sendo gravados na sua conta.</p>
              </>
            ) : success ? (
              <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
            ) : error ? (
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
            ) : (
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                  isDragging ? "bg-primary/20" : "bg-secondary",
                )}
              >
                <Upload
                  className={cn("h-5 w-5 transition-colors", isDragging ? "text-primary" : "text-muted-foreground")}
                />
              </div>
            )}

            {fileName ? (
              <div className="space-y-1">
                <p className="font-medium text-foreground">{fileName}</p>
                {error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : savingToProfile ? (
                  <p className="text-sm text-primary">Salvando no seu perfil...</p>
                ) : success ? (
                  <p className="text-sm text-success">Arquivo carregado com sucesso!</p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  {isDragging ? "Solte o arquivo aqui" : "Clique ou arraste o arquivo"}
                </p>
                <p className="text-sm text-muted-foreground">Suporta .xlsx e .csv</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
