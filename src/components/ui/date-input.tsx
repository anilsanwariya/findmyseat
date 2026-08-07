import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Mobile/tablet friendly date field.
 * - full width inside its container (never clips out of dialogs)
 * - 44px minimum touch target
 * - native picker indicator sized up and kept inside the field
 */
export const DateInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <Input
      ref={ref}
      type="date"
      {...props}
      className={cn(
        "block w-full min-w-0 max-w-full h-11 min-h-[44px] appearance-none px-3 text-base sm:text-sm",
        "[&::-webkit-calendar-picker-indicator]:ml-auto [&::-webkit-calendar-picker-indicator]:size-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70",
        "[&::-webkit-date-and-time-value]:text-left",
        className,
      )}
    />
  ),
);
DateInput.displayName = "DateInput";
