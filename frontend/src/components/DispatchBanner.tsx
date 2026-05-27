import { Activity, CheckCircle2, XCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { DisparoSession } from '@/hooks/useDisparoSession';

interface DispatchBannerProps {
  session:   DisparoSession;
  onCancel:  () => void;
  onDismiss: () => void;
}

export function DispatchBanner({ session, onCancel, onDismiss }: DispatchBannerProps) {
  const { status, total, sent, errors, instance_name } = session;
  const processed = sent + errors;
  const progress  = total > 0 ? (processed / total) * 100 : 0;

  const isRunning   = status === 'running';
  const isCompleted = status === 'completed';
  const isCancelled = status === 'cancelled' || status === 'failed';

  return (
    <div
      className={[
        'border rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 flex items-center gap-3 sm:gap-4 transition-colors shadow-md',
        isRunning   && 'bg-primary/10 border-primary/30',
        isCompleted && 'bg-success/10 border-success/30',
        isCancelled && 'bg-muted/60  border-border',
      ].filter(Boolean).join(' ')}
    >
      {/* Ícone */}
      {isRunning   && <Activity    className="h-4 w-4 text-primary animate-pulse shrink-0" />}
      {isCompleted && <CheckCircle2 className="h-4 w-4 text-success shrink-0" />}
      {isCancelled && <XCircle      className="h-4 w-4 text-muted-foreground shrink-0" />}

      {/* Conteúdo central */}
      <div className="flex-1 min-w-0">
        {/* Linha 1: título + instância + contadores */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium leading-tight">
            {isRunning   && 'Disparo em andamento'}
            {isCompleted && 'Disparo concluído'}
            {isCancelled && 'Disparo cancelado'}
          </span>
          <span className="text-xs text-muted-foreground hidden sm:inline">via {instance_name}</span>
          <span className="text-xs text-muted-foreground">
            {sent}/{total}
            {errors > 0 && (
              <span className="text-destructive font-medium"> · {errors} erro{errors !== 1 ? 's' : ''}</span>
            )}
          </span>
        </div>

        {/* Barra de progresso */}
        <Progress value={progress} className="h-1 mt-1.5" />

        {/* Resumo pós-disparo */}
        {(isCompleted || isCancelled) && errors > 0 && (
          <p className="text-xs text-destructive mt-1 font-medium leading-tight">
            {errors} lead{errors !== 1 ? 's' : ''} com erro removido{errors !== 1 ? 's' : ''} da lista.
          </p>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isRunning && (
          <Button size="sm" variant="destructive" className="h-7 text-xs px-2.5" onClick={onCancel}>
            <span className="hidden sm:inline">Cancelar disparo</span>
            <span className="sm:hidden">Cancelar</span>
          </Button>
        )}
        {!isRunning && (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onDismiss} title="Fechar">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
