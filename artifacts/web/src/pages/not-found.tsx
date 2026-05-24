import { useRoute } from "wouter";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const [match] = useRoute("/reservation/:id");
  
  if (match) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-8 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md w-full border border-border p-12 bg-card rounded-none shadow-xl">
        <AlertCircle className="w-16 h-16 text-destructive mx-auto" />
        <div className="space-y-2">
          <h1 className="text-4xl font-mono tracking-tighter text-foreground uppercase">404</h1>
          <h2 className="text-lg font-mono text-muted-foreground uppercase">Page Not Found</h2>
        </div>
        <p className="text-sm text-muted-foreground font-sans">
          The requested resource could not be located in the system.
        </p>
        <Button variant="outline" className="w-full rounded-none font-mono tracking-widest mt-4" onClick={() => window.location.href = "/"}>
          <ArrowLeft className="mr-2 h-4 w-4" /> RETURN TO CATALOG
        </Button>
      </div>
    </div>
  );
}
