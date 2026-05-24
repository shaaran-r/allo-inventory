import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ProductWithStock } from "@workspace/api-client-react/src/generated/api.schemas";
import { useCreateReservation, getListProductsQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Package } from "lucide-react";

interface ReserveDialogProps {
  product: ProductWithStock | null;
  onClose: () => void;
}

export function ReserveDialog({ product, onClose }: ReserveDialogProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");

  const createMutation = useCreateReservation();

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setWarehouseId("");
      setQuantity("1");
      onClose();
    }
  };

  const selectedWarehouse = product?.stockLevels.find(w => w.warehouseId === warehouseId);
  const maxAvailable = selectedWarehouse?.availableUnits || 0;
  const numQuantity = parseInt(quantity, 10);
  const isValid = warehouseId !== "" && !isNaN(numQuantity) && numQuantity > 0 && numQuantity <= maxAvailable;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !isValid) return;

    createMutation.mutate(
      { 
        data: {
          productId: product.id,
          warehouseId,
          quantity: numQuantity
        }
      },
      {
        onSuccess: (res) => {
          toast({
            title: "Reservation Created",
            description: "Units temporarily allocated. Proceed to checkout.",
          });
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          handleOpenChange(false);
          setLocation(`/reservation/${res.id}`);
        },
        onError: (error: any) => {
          toast({
            title: "Reservation Failed",
            description: error?.data?.error || "An error occurred",
            variant: "destructive",
          });
        }
      }
    );
  };

  if (!product) return null;

  return (
    <Dialog open={!!product} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-none border-border">
        <DialogHeader>
          <DialogTitle className="font-mono text-xl tracking-tight uppercase flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Allocate Units
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            SKU: {product.sku} | {product.name}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="warehouse" className="font-mono text-xs uppercase">Source Warehouse</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="rounded-none border-border focus:ring-primary h-12">
                <SelectValue placeholder="Select location..." />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border">
                {product.stockLevels.map((loc) => (
                  <SelectItem 
                    key={loc.warehouseId} 
                    value={loc.warehouseId}
                    disabled={loc.availableUnits === 0}
                    className="font-mono rounded-none"
                  >
                    {loc.warehouseName} ({loc.availableUnits} available)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity" className="font-mono text-xs uppercase flex justify-between">
              <span>Quantity</span>
              {warehouseId && <span className="text-muted-foreground text-xs">Max: {maxAvailable}</span>}
            </Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              max={maxAvailable}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="rounded-none border-border font-mono text-lg h-12"
              disabled={!warehouseId}
            />
          </div>

          {createMutation.error && (
             <div className="p-3 bg-destructive/10 border border-destructive text-destructive font-mono text-sm">
               Error: {(createMutation.error as any)?.data?.error || "Request failed"}
             </div>
          )}

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => handleOpenChange(false)}
              className="rounded-none font-mono"
            >
              CANCEL
            </Button>
            <Button 
              type="submit" 
              disabled={!isValid || createMutation.isPending}
              className="rounded-none font-mono tracking-wide"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              CONFIRM ALLOCATION
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
