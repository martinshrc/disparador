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
        'border rounded-lg px-4 py-3 flex items-center gap-4 transition-colors',
        isRunning   && 'bg-primary/10 border-primary/30',
        isCompleted && 'bg-success/10 border-success/30',
        isCancelled && 'bg-muted/60  border-border',
      ].filter(Boolean).join(' ')}
    >
      {/* Ícone de status */}
      {isRunning && (
        <Activity className="h-4 w-4 text-primary animate-pulse shrink-0" />
      )}
      {isCompleted && (
        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
      )}
      {isCancelled && (
        <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
      )}

      {/* Texto + barra */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium">
            {isRunning   && 'Disparo em andamento'}
            {isCompleted && 'Disparo concluído'}
            {isCancelled && 'Disparo cancelado'}
          </p>
          <span className="text-xs text-muted-foreground">
            via {instance_name}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-1">
          <Progress
            value={progress}
            className="h-1.5 flex-1"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {sent} enviados · {errors > 0 && `${errors} erros · `}{total} total
          </span>
        </div>
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2 shrink-0">
        {isRunning && (
          <Button size="sm" variant="destructive" onClick={onCancel}>
            Cancelar disparo
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
