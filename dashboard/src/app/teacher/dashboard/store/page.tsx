"use client";

import { useEffect, useState, useCallback } from "react";
import { useTeacherAuth } from "@/context/teacher-auth-context";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShoppingCart, Plus, Minus, Send, Package, History } from "lucide-react";

interface StoreItem {
  id: string;
  item_id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  image_url?: string;
  is_active: boolean;
}

interface CartItem {
  item_id: string;
  item_name: string;
  quantity: number;
  max: number;
}

interface StoreRequestRecord {
  id: string;
  request_id: string;
  store: string;
  status: string;
  items: { item_name: string; qty_requested: number; qty_approved: number }[];
  requested_at: string;
  notes: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  issued: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

export default function TeacherStorePage() {
  const { teacher } = useTeacherAuth();
  const [activeTab, setActiveTab] = useState("browse");
  const [storeType, setStoreType] = useState<"general" | "it">("general");
  const [items, setItems] = useState<StoreItem[]>([]);
  const [requests, setRequests] = useState<StoreRequestRecord[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(false);

  const loadItems = useCallback(async () => {
    if (!teacher) return;
    try {
      const res = await fetch(
        `/api/teacher/store?uid=${teacher.uid}&action=items&store=${storeType}`
      );
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [teacher, storeType]);

  const loadRequests = useCallback(async () => {
    if (!teacher) return;
    try {
      const res = await fetch(
        `/api/teacher/store?uid=${teacher.uid}&action=requests`
      );
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch {
      // silently fail
    }
  }, [teacher]);

  useEffect(() => {
    if (teacher) {
      loadItems();
      loadRequests();
    }
  }, [teacher, loadItems, loadRequests]);

  const addToCart = (item: StoreItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item_id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.item_id === item.id
            ? { ...c, quantity: Math.min(c.quantity + 1, c.max) }
            : c
        );
      }
      return [
        ...prev,
        { item_id: item.id, item_name: item.name, quantity: 1, max: item.quantity },
      ];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item_id === itemId);
      if (existing && existing.quantity > 1) {
        return prev.map((c) =>
          c.item_id === itemId ? { ...c, quantity: c.quantity - 1 } : c
        );
      }
      return prev.filter((c) => c.item_id !== itemId);
    });
  };

  const submitRequest = async () => {
    if (cart.length === 0 || !teacher) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/teacher/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: teacher.uid,
          store: storeType,
          items: cart.map((c) => ({
            item_id: c.item_id,
            item_name: c.item_name,
            quantity: c.quantity,
          })),
        }),
      });
      if (res.ok) {
        setCart([]);
        setCartOpen(false);
        loadRequests();
        setActiveTab("history");
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  const filteredItems = items.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.category.toLowerCase().includes(search.toLowerCase())
  );

  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-emerald-500" />
            Store Requests
          </h1>
          <p className="text-muted-foreground">
            Browse items and submit store requests
          </p>
        </div>

        {cart.length > 0 && (
          <Button
            onClick={() => setCartOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 relative"
          >
            <ShoppingCart className="h-4 w-4 mr-1" />
            Cart
            <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-[10px]">
              {cartCount}
            </Badge>
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="browse" className="gap-1">
            <Package className="h-4 w-4" />
            Browse Items
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1">
            <History className="h-4 w-4" />
            My Requests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-4 mt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex rounded-lg border">
              <button
                className={`px-4 py-2 text-sm font-medium rounded-l-lg transition-colors ${
                  storeType === "general" ? "bg-emerald-600 text-white" : "hover:bg-muted"
                }`}
                onClick={() => { setStoreType("general"); setLoading(true); }}
              >
                General Store
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium rounded-r-lg transition-colors ${
                  storeType === "it" ? "bg-emerald-600 text-white" : "hover:bg-muted"
                }`}
                onClick={() => { setStoreType("it"); setLoading(true); }}
              >
                IT Store
              </button>
            </div>
            <Input
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-xs"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            </div>
          ) : filteredItems.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No items found.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => {
                const inCart = cart.find((c) => c.item_id === item.id);
                return (
                  <Card key={item.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {item.category.replace("_", " ")} &bull; {item.unit}
                          </p>
                          <p className="text-xs">
                            Available: <span className="font-medium">{item.quantity}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {inCart ? (
                            <>
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => removeFromCart(item.id)}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-6 text-center text-sm font-medium">{inCart.quantity}</span>
                              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addToCart(item)} disabled={inCart.quantity >= item.quantity}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addToCart(item)} disabled={item.quantity <= 0}>
                              <Plus className="h-3 w-3 mr-1" /> Add
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3 mt-4">
          {requests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No store requests yet.
              </CardContent>
            </Card>
          ) : (
            requests.map((r) => (
              <Card key={r.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      {r.request_id}
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        {r.store === "it" ? "IT Store" : "General Store"}
                      </Badge>
                    </CardTitle>
                    <Badge className={`text-[10px] border-0 ${STATUS_COLORS[r.status] || ""}`}>
                      {r.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {r.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{item.item_name}</span>
                        <span className="text-muted-foreground">
                          &times;{item.qty_requested}
                          {item.qty_approved > 0 && item.qty_approved !== item.qty_requested && (
                            <span className="text-green-600 ml-1">(approved: {item.qty_approved})</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  {r.requested_at && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Requested: {new Date(r.requested_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Cart Dialog */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Your Cart ({cartCount} items)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {cart.map((c) => (
              <div key={c.item_id} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium truncate flex-1 mr-2">{c.item_name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => removeFromCart(c.item_id)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm">{c.quantity}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-6 w-6"
                    onClick={() =>
                      setCart((prev) =>
                        prev.map((x) =>
                          x.item_id === c.item_id
                            ? { ...x, quantity: Math.min(x.quantity + 1, x.max) }
                            : x
                        )
                      )
                    }
                    disabled={c.quantity >= c.max}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            onClick={submitRequest}
            disabled={submitting || cart.length === 0}
          >
            <Send className="h-4 w-4 mr-1" />
            {submitting ? "Submitting..." : "Submit Request"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
