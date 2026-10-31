import { cva } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Circle, Clock3, Minus, ArrowDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { PRIORITY_LABEL, STATUS_LABEL, type IncidentStatus } from "@/lib/incident-meta";
import type { Priority } from "@/lib/priority";

const priorityVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider",
  {
    variants: {
      priority: {
        alta: "bg-priority-high-soft text-priority-high",
        media: "bg-priority-medium-soft text-priority-medium",
        baixa: "bg-priority-low-soft text-priority-low",
      },
    },
  },
);

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const Icon = priority === "alta" ? AlertTriangle : priority === "media" ? Minus : ArrowDown;
  return (
    <span className={cn(priorityVariants({ priority }), className)}>
      <Icon className="size-3" /> {PRIORITY_LABEL[priority]}
    </span>
  );
}

const statusVariants = cva("inline-flex items-center gap-1.5 text-xs font-medium", {
  variants: {
    status: {
      pendente: "text-status-pending",
      em_andamento: "text-status-progress",
      concluido: "text-status-done",
    },
  },
});

export function StatusBadge({ status, className }: { status: IncidentStatus; className?: string }) {
  const Icon = status === "pendente" ? Circle : status === "em_andamento" ? Clock3 : CheckCircle2;
  return (
    <span className={cn(statusVariants({ status }), className)}>
      <Icon className="size-3.5" /> {STATUS_LABEL[status]}
    </span>
  );
}

export const priorityBarClass: Record<Priority, string> = {
  alta: "bg-priority-high",
  media: "bg-priority-medium",
  baixa: "bg-priority-low",
};
