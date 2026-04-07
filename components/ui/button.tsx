import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "border border-white/10 bg-primary text-primary-foreground shadow-[0_12px_36px_rgba(255,255,255,0.16)] hover:border-white/20 hover:bg-white/90",
        secondary:
          "border border-white/10 bg-white/10 text-secondary-foreground shadow-[0_10px_24px_rgba(15,23,42,0.28)] hover:border-white/20 hover:bg-white/20",
        outline:
          "border border-white/10 bg-white/5 text-foreground hover:border-white/20 hover:bg-white/12",
        ghost: "text-foreground hover:bg-white/10",
        destructive:
          "border border-red-400/20 bg-destructive text-destructive-foreground hover:border-red-400/30 hover:bg-destructive/90"
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-12 rounded-xl px-6 text-base",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };
