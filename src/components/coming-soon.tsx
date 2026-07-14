import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ComingSoon({
  title,
  phase,
  desc,
}: {
  title: string;
  phase: string;
  desc: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{title}</CardTitle>
          <Badge variant="outline">{phase}</Badge>
        </div>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        이 화면은 다음 구현 단계에서 완성됩니다. Phase 1-A(기반)는 완료되었습니다.
      </CardContent>
    </Card>
  );
}
