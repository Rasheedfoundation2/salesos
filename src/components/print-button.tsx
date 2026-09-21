"use client";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui";
export function PrintButton({ label = "Export PDF" }: { label?: string }) {
  return <Button size="sm" variant="secondary" onClick={() => window.print()} className="print:hidden"><Printer />{label}</Button>;
}
