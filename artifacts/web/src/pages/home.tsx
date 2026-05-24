import { useState } from "react";
import { useListProducts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, MapPin, Database } from "lucide-react";
import { ReserveDialog } from "@/components/reserve-dialog";
import { ProductWithStock } from "@workspace/api-client-react/src/generated/api.schemas";

export default function Home() {
  const { data: products, isLoading, error } = useListProducts();
  const [selectedProduct, setSelectedProduct] = useState<ProductWithStock | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="rounded-none border-border">
                <CardHeader>
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/4" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-8 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Database className="w-12 h-12 text-destructive mx-auto" />
          <h2 className="text-xl font-mono text-destructive">System Offline</h2>
          <p className="text-muted-foreground">Unable to connect to inventory cluster.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-mono tracking-tight uppercase flex items-center gap-2">
              <Database className="w-6 h-6 text-primary" />
              Allo Inventory
            </h1>
            <p className="text-muted-foreground font-mono text-sm">Global Stock Availability</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs border-primary text-primary">LIVE</Badge>
          </div>
        </div>

        {products?.length === 0 ? (
          <Card className="rounded-none border-dashed">
            <CardContent className="flex flex-col items-center justify-center h-64 text-center">
              <Package className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
              <p className="text-lg font-mono text-muted-foreground">No catalog entries found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {products?.map((product) => {
              const totalAvailable = product.stockLevels.reduce((acc, loc) => acc + loc.availableUnits, 0);
              
              return (
                <Card key={product.id} className="rounded-none border-border group hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="secondary" className="font-mono bg-secondary/50 rounded-none">{product.sku}</Badge>
                      {totalAvailable > 0 ? (
                         <Badge className="font-mono bg-primary text-primary-foreground hover:bg-primary rounded-none">IN STOCK</Badge>
                      ) : (
                         <Badge variant="destructive" className="font-mono rounded-none">OUT OF STOCK</Badge>
                      )}
                    </div>
                    <CardTitle className="text-xl tracking-tight">{product.name}</CardTitle>
                    <CardDescription className="line-clamp-2">{product.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-3">
                      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Locations</div>
                      {product.stockLevels.map((loc) => (
                        <div key={loc.warehouseId} className="flex items-center justify-between text-sm p-2 bg-muted/30 border border-transparent group-hover:border-border transition-colors">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{loc.warehouseName}</span>
                          </div>
                          <div className="font-mono text-right">
                            <span className={loc.availableUnits > 0 ? "text-foreground" : "text-muted-foreground"}>
                              {loc.availableUnits}
                            </span>
                            <span className="text-muted-foreground"> / {loc.totalUnits}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <Button 
                      className="w-full rounded-none font-mono tracking-wider h-12"
                      disabled={totalAvailable === 0}
                      onClick={() => setSelectedProduct(product)}
                    >
                      {totalAvailable > 0 ? "RESERVE UNITS" : "UNAVAILABLE"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ReserveDialog 
        product={selectedProduct} 
        onClose={() => setSelectedProduct(null)} 
      />
    </div>
  );
}
