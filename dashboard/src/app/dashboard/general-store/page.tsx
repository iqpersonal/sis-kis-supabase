"use client";

import StorePage from "@/components/store/store-page";
import { GENERAL_STORE_CONFIG } from "@/lib/store-config";

export default function GeneralStorePage() {
  return <StorePage storeConfig={GENERAL_STORE_CONFIG} apiBase="/api/general-store" />;
}
