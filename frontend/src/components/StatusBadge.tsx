import { Loader2, CheckCircle2, XCircle, Clock, Sparkles, Send, Ban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ContactRow } from '@/types/dispatcher';
import { cn } from '@/lib/utils';

type StatusType = ContactRow['status'] | 'cancelado';

interface StatusBadgeProps {
  status: StatusType;
  compact?: boolean;
}

const statusConfig: Record<StatusType, {
  label: string;
  icon: typeof CheckCircle2;
  className: string;
}> = {
  'pendente': {
    label: 'Pendente',
    icon: Clock,
    className: 'bg-muted text-muted-foreground border-border',
  },
  'gerando-ia': {
    label: 'Gerando IA',
    icon: Sparkles,
    className: 'bg-primary/10 text-primary border-primary/30 animate-pulse',
  },
  'enviando': {
    label: 'Enviando',
    icon: Send,
    className: 'bg-warning/10 text-warning border-warning/30',
  },
  'sucesso': {
    label: 'Sucesso',
    icon: CheckCircle2,
    className: 'bg-success/10 text-success border-success/30',
  },
  'erro': {
    label: 'Erro',
    icon: XCircle,
    className: 'bg-destructive/10 text-destructive border-destructive/30',
  },
  'cancelado': {
    label: 'Cancelado',
    icon: Ban,
    className: 'bg-muted/50 text-muted-foreground border-border/50',
  },
};

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const isLoading = status === 'gerando-ia' || status === 'enviando';

  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", compact && "text-xs py-0 px-1.5", config.className)}>
      {isLoading ? (
        <Loader2 className={cn("animate-spin", compact ? "h-2.5 w-2.5" : "h-3 w-3")} />
      ) : (
        <Icon className={cn(compact ? "h-2.5 w-2.5" : "h-3 w-3")} />
      )}
      {config.label}
    </Badge>
  );
}
