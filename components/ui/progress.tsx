"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

type RootProps = React.ComponentProps<typeof ProgressPrimitive.Root>

function Progress({
  className,
  value,
  indicatorColor,
  fraction,
  reverse,
  ...props
}: RootProps & { indicatorColor?: string; fraction?: number; reverse?: boolean }) {
  const useFraction = typeof fraction === "number";
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all"
        style={
          useFraction
            ? {
                transform: `scaleX(${Math.max(0, Math.min(1, fraction!))})`,
                transformOrigin: reverse ? "right" : "left",
                ...(indicatorColor ? { backgroundColor: indicatorColor } : {}),
              }
            : {
                transform: `translateX(-${100 - (value || 0)}%)`,
                ...(indicatorColor ? { backgroundColor: indicatorColor } : {}),
              }
        }
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
