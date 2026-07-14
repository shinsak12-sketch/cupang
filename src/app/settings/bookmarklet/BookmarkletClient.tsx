"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyBookmarklet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <Button
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "복사됨 ✓" : "북마클릿 코드 복사"}
      </Button>
      <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">{code}</pre>
    </div>
  );
}
