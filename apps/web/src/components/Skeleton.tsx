
interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`bg-surface-raised rounded-sm animate-pulse opacity-45 ${className}`}
      style={{ animationDuration: "1.6s" }}
    />
  );
}

export function BillRowSkeleton() {
  return (
    <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 first:pt-0 last:pb-0">
      <div className="flex-1 space-y-2 min-w-0">
        <div className="flex items-center gap-2">
          <Skeleton className="h-[15px] w-1/3" />
          <Skeleton className="h-[18px] w-[50px] rounded-full" />
        </div>
        <Skeleton className="h-[13px] w-2/3" />
      </div>
      <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pt-2 sm:pt-0 border-t border-border-warm/40 sm:border-0">
        <div className="space-y-1.5 text-left sm:text-right">
          <Skeleton className="h-[15px] w-[80px]" />
          <Skeleton className="h-[11px] w-[120px]" />
        </div>
        <Skeleton className="w-8 h-8 rounded-sm" />
      </div>
    </div>
  );
}

export function PaymentRowSkeleton() {
  return (
    <tr className="border-b border-border-warm/40 last:border-0">
      <td className="px-4 py-3.5">
        <Skeleton className="h-[14px] w-1/3 min-w-[100px]" />
      </td>
      <td className="px-4 py-3.5">
        <Skeleton className="h-[14px] w-[80px]" />
      </td>
      <td className="px-4 py-3.5">
        <Skeleton className="h-[14px] w-[120px]" />
      </td>
      <td className="px-4 py-3.5">
        <Skeleton className="h-[18px] w-[60px] rounded-full" />
      </td>
      <td className="px-4 py-3.5 text-right">
        <Skeleton className="h-8 w-20 rounded-sm ml-auto" />
      </td>
    </tr>
  );
}
