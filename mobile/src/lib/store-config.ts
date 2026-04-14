import type { StoreType } from "@/types/store";

export interface StoreConfig {
  type: StoreType;
  label: string;
  labelAr: string;
  idPrefix: string;
  collections: {
    items: string;
    requests: string;
    transactions: string;
  };
  categories: readonly string[];
  categoryLabels: Record<string, string>;
}

export const GENERAL_STORE_CONFIG: StoreConfig = {
  type: "general",
  label: "General Store",
  labelAr: "المخزن العام",
  idPrefix: "GS",
  collections: {
    items: "gs_items",
    requests: "gs_requests",
    transactions: "gs_transactions",
  },
  categories: ["stationery", "office_supplies", "cleaning", "classroom", "furniture", "other"],
  categoryLabels: {
    stationery: "Stationery",
    office_supplies: "Office Supplies",
    cleaning: "Cleaning Supplies",
    classroom: "Classroom Materials",
    furniture: "Furniture",
    other: "Other",
  },
};

export const IT_STORE_CONFIG: StoreConfig = {
  type: "it",
  label: "IT Store",
  labelAr: "مخزن تقنية المعلومات",
  idPrefix: "ITS",
  collections: {
    items: "its_items",
    requests: "its_requests",
    transactions: "its_transactions",
  },
  categories: ["toner_ink", "cables", "peripherals", "storage", "networking", "components", "other"],
  categoryLabels: {
    toner_ink: "Toner & Ink",
    cables: "Cables",
    peripherals: "Peripherals",
    storage: "Storage Media",
    networking: "Networking",
    components: "Components",
    other: "Other",
  },
};

export const STORE_CONFIGS: Record<StoreType, StoreConfig> = {
  general: GENERAL_STORE_CONFIG,
  it: IT_STORE_CONFIG,
};
