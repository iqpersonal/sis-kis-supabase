export type StoreType = "general" | "it";

export type RequestStatus =
  | "pending"
  | "approved"
  | "partially_approved"
  | "rejected"
  | "issued";

export interface StoreItem {
  id: string;
  item_id: string;
  name: string;
  name_ar: string;
  category: string;
  unit: string;
  quantity: number;
  reorder_level: number;
  location: string;
  branch: string;
  notes: string;
  barcode?: string;
  image_url?: string;
  custom_image_url?: string;
  is_active: boolean;
  created_at: string;
  updated_by: string;
}

export interface StoreRequestItem {
  item_id: string;
  name: string;
  qty_requested: number;
  qty_approved: number;
}

export interface StoreRequest {
  id: string;
  request_id: string;
  requested_by: string;
  requested_by_name: string;
  items: StoreRequestItem[];
  status: RequestStatus;
  notes: string;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  issued_by: string | null;
  issued_by_name: string | null;
  issued_at: string | null;
}

export interface StoreTransaction {
  id: string;
  txn_id: string;
  type: "receive" | "issue";
  item_id: string;
  item_name: string;
  quantity: number;
  request_id: string | null;
  staff_number: string | null;
  staff_name: string | null;
  notes: string;
  performed_by: string;
  timestamp: string;
}
