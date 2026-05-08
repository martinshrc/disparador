import { Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  seconds: number;
  maxSeconds: number;
}

export function CountdownTimer({ seconds, maxSeconds }: CountdownTimerProps) {
  const progress = (seconds / maxSeconds) * 100;
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold font-mono text-foreground">{seconds}</span>
        </div>
      </div>
      
      <div className="flex-1">
        <div className="flex items-center gap-2 text-primary mb-1">
          <Timer className="h-4 w-4" />
          <span className="font-semibold">Aguardando</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Próximo envio em <span className="font-mono font-medium text-foreground">{seconds}</span> segundos...
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Intervalo aleatório para proteção anti-bloqueio
        </p>
      </div>
    </div>
  );
}
