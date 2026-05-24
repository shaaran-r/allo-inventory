import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useGetReservation, useConfirmReservation, useReleaseReservation, getGetReservationQueryKey, getListProductsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Clock, CheckCircle2, XCircle, ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

function CountdownTimer({ expiresAt, onExpire }: { expiresAt: string, onExpire: () => void }) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const diff = new Date(expiresAt).getTime() - new Date().getTime();
      return Math.max(0, Math.floor(diff / 1000));
    };

    const initial = calculateTimeLeft();
    setTimeLeft(initial);
    
    if (initial === 0) {
      setExpired(true);
      onExpire();
      return;
    }

    const timer = setInterval(() => {
      const current = calculateTimeLeft();
      setTimeLeft(current);
      
      if (current === 0) {
        clearInterval(timer);
        setExpired(true);
        onExpire();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt, onExpire]);

  if (expired) {
    return <span className="text-destructive font-mono font-bold">EXPIRED</span>;
  }

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  
  return (
    <span className={`font-mono font-bold ${timeLeft < 60 ? 'text-destructive animate-pulse' : 'text-primary'}`}>
      {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
    </span>
  );
}

export default function ReservationDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = params.id as string;

  const { data: reservation, isLoading, error } = useGetReservation(id, { 
    query: { 
      enabled: !!id, 
      queryKey: getGetReservationQueryKey(id) 
    } 
  });

  const confirmMutation = useConfirmReservation();
  const releaseMutation = useReleaseReservation();

  const handleExpire = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetReservationQueryKey(id) });
  }, [id, queryClient]);

  const handleConfirm = () => {
    confirmMutation.mutate({ id }, {
      onSuccess: () => {
        toast({
          title: "Reservation Confirmed",
          description: "Units have been permanently allocated.",
        });
        queryClient.invalidateQueries({ queryKey: getGetReservationQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      },
      onError: (err: any) => {
        toast({
          title: "Confirmation Failed",
          description: err?.data?.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    });
  };

  const handleRelease = () => {
    releaseMutation.mutate({ id }, {
      onSuccess: () => {
        toast({
          title: "Reservation Released",
          description: "Units have been returned to available stock.",
        });
        queryClient.invalidateQueries({ queryKey: getGetReservationQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      },
      onError: (err: any) => {
        toast({
          title: "Release Failed",
          description: err?.data?.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="w-full max-w-lg rounded-none border-border">
          <CardHeader>
            <Skeleton className="h-8 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="min-h-screen bg-background p-4 flex flex-col items-center justify-center space-y-6">
        <AlertCircle className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-mono">Reservation Not Found</h2>
        <Button onClick={() => setLocation("/")} variant="outline" className="rounded-none">
          <ArrowLeft className="mr-2 h-4 w-4" /> Return to Catalog
        </Button>
      </div>
    );
  }

  const isPending = reservation.status === "pending";
  const isConfirmed = reservation.status === "confirmed";
  const isReleased = reservation.status === "released";

  return (
    <div className="min-h-screen bg-background p-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl space-y-6">
        <Button onClick={() => setLocation("/")} variant="ghost" className="rounded-none font-mono">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Catalog
        </Button>
        
        <Card className="rounded-none border-border shadow-2xl overflow-hidden relative">
          <div className={`absolute top-0 left-0 w-full h-1 ${
            isPending ? 'bg-primary' : isConfirmed ? 'bg-green-500' : 'bg-destructive'
          }`} />
          
          <CardHeader className="pb-6 border-b border-border/50 bg-muted/10">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-sm text-muted-foreground">ID: {reservation.id}</span>
              {isPending && (
                <Badge variant="outline" className="font-mono border-primary text-primary rounded-none px-3 py-1">
                  PENDING ALLOCATION
                </Badge>
              )}
              {isConfirmed && (
                <Badge className="font-mono bg-green-500 hover:bg-green-600 rounded-none px-3 py-1 text-white flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> CONFIRMED
                </Badge>
              )}
              {isReleased && (
                <Badge variant="destructive" className="font-mono rounded-none px-3 py-1 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> RELEASED
                </Badge>
              )}
            </div>
            <CardTitle className="text-3xl tracking-tight">{reservation.productName}</CardTitle>
            <div className="font-mono text-sm text-muted-foreground mt-1">SKU: {reservation.productSku}</div>
          </CardHeader>
          
          <CardContent className="p-8 space-y-8">
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-1">
                <div className="text-xs font-mono text-muted-foreground uppercase">Warehouse</div>
                <div className="font-medium text-lg">{reservation.warehouseName}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-mono text-muted-foreground uppercase">Quantity</div>
                <div className="font-medium text-lg font-mono text-primary">{reservation.quantity} UNITS</div>
              </div>
            </div>

            {isPending && (
              <div className="flex items-center justify-between p-4 bg-muted/30 border border-primary/20 rounded-none">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-primary" />
                  <span className="font-mono text-sm uppercase">Time Remaining</span>
                </div>
                <CountdownTimer 
                  expiresAt={reservation.expiresAt} 
                  onExpire={handleExpire}
                />
              </div>
            )}

            {confirmMutation.error && (
              <div className="p-4 bg-destructive/10 border border-destructive text-destructive font-mono text-sm">
                Error: {(confirmMutation.error as any)?.data?.error || "Confirmation failed"}
              </div>
            )}
            
            {releaseMutation.error && (
              <div className="p-4 bg-destructive/10 border border-destructive text-destructive font-mono text-sm">
                Error: {(releaseMutation.error as any)?.data?.error || "Release failed"}
              </div>
            )}
          </CardContent>

          {isPending && (
            <CardFooter className="bg-muted/10 p-6 flex gap-4 border-t border-border/50">
              <Button 
                variant="outline" 
                className="flex-1 rounded-none font-mono h-12"
                onClick={handleRelease}
                disabled={releaseMutation.isPending || confirmMutation.isPending}
              >
                {releaseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                CANCEL
              </Button>
              <Button 
                className="flex-1 rounded-none font-mono h-12"
                onClick={handleConfirm}
                disabled={releaseMutation.isPending || confirmMutation.isPending}
              >
                {confirmMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                CONFIRM PURCHASE
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
