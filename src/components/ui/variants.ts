import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-navy-900 text-white hover:bg-navy-800 shadow-sm",
        accent: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
        secondary: "bg-white text-ink border border-line hover:bg-slate-50 shadow-sm",
        ghost: "text-muted hover:bg-slate-100 hover:text-ink",
        danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
        link: "text-brand-600 hover:underline px-0 h-auto",
      },
      size: { sm: "h-8 px-2.5 text-[13px]", md: "h-9 px-3.5", lg: "h-10 px-5", icon: "h-8 w-8" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
