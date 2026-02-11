import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DealsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Table Card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          {/* Table header */}
          <div className="flex gap-4 border-b pb-3 mb-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24 hidden sm:block" />
            <Skeleton className="h-4 w-20 hidden lg:block" />
            <Skeleton className="h-4 w-24 hidden md:block" />
            <Skeleton className="h-4 w-16" />
          </div>
          {/* Table rows */}
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b last:border-0">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-24 hidden sm:block" />
              <Skeleton className="h-5 w-20 hidden lg:block" />
              <Skeleton className="h-5 w-20 hidden md:block" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-5 w-8" />
              <Skeleton className="h-5 w-20 hidden md:block" />
              <Skeleton className="h-8 w-8 ml-auto" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
