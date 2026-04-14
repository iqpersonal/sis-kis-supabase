"use client";

import StorePage from "@/components/store/store-page";
import { IT_STORE_CONFIG } from "@/lib/store-config";

export default function ITStorePage() {
  return <StorePage storeConfig={IT_STORE_CONFIG} apiBase="/api/it-store" />;
}
