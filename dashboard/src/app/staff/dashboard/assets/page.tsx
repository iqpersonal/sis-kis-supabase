"use client";

import { useEffect, useState } from "react";
import { useStaffAuth } from "@/context/staff-auth-context";
import { getSupabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Monitor, Laptop, Printer, Smartphone, Wifi, Tv, HardDrive } from "lucide-react";
import type { ITAsset } from "@/types/sis";

const ASSET_ICONS: Record<string, typeof Monitor> = {
  laptop: Laptop,
  desktop: Monitor,
  printer: Printer,
  phone: Smartphone,
  tablet: Smartphone,
  network_device: Wifi,
  projector: Tv,
  monitor: Monitor,
  other: HardDrive,
};

const CONDITION_COLORS: Record<string, string> = {
  excellent: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  good: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  fair: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  poor: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function StaffAssetsPage() {
  const { staff } = useStaffAuth();
  const [assets, setAssets] = useState<ITAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!staff) return;

    async function load() {
      try {
        const { data: { session } } = await getSupabase().auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const res = await fetch("/api/staff-portal/assets", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAssets(data.assets || []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [staff]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Monitor className="h-6 w-6 text-purple-500" />
          My Assets
        </h1>
        <p className="text-muted-foreground">
          IT equipment assigned to you
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
        </div>
      ) : assets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No IT assets currently assigned to you.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => {
            const Icon = ASSET_ICONS[asset.asset_type] || HardDrive;
            return (
              <Card key={asset.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                        <Icon className="h-4 w-4 text-purple-500" />
                      </div>
                      <CardTitle className="text-sm">
                        {asset.brand} {asset.model}
                      </CardTitle>
                    </div>
                    <Badge
                      className={`text-[10px] border-0 ${CONDITION_COLORS[asset.condition] || ""}`}
                    >
                      {asset.condition}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="capitalize">
                      {asset.asset_type.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Asset ID</span>
                    <span className="font-mono text-xs">{asset.asset_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Serial</span>
                    <span className="font-mono text-xs">
                      {asset.serial_number}
                    </span>
                  </div>
                  {asset.warranty_expiry && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Warranty</span>
                      <span>
                        {new Date(asset.warranty_expiry).toLocaleDateString(
                          "en-US",
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }
                        )}
                      </span>
                    </div>
                  )}
                  {asset.assigned_date && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Assigned</span>
                      <span>
                        {new Date(asset.assigned_date).toLocaleDateString(
                          "en-US",
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }
                        )}
                      </span>
                    </div>
                  )}
                  {asset.location && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Location</span>
                      <span>{asset.location}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
