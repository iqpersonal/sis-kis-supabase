import { createServiceClient } from "@/lib/supabase-server";

/**
 * Storage paths:
 *   store-images/{storeType}/{itemDocId}/catalog   — AI/web-sourced image
 *   store-images/{storeType}/{itemDocId}/custom     — User-uploaded photo
 */

const BUCKET = "store-images";

type ImageSlot = "catalog" | "custom";

function storagePath(storeType: string, itemDocId: string, slot: ImageSlot) {
  return `${storeType}/${itemDocId}/${slot}`;
}

/**
 * Upload a file (Blob/File from web) to Supabase Storage.
 * Returns the public download URL.
 */
export async function uploadStoreImage(
  storeType: string,
  itemDocId: string,
  slot: ImageSlot,
  file: Blob | File,
): Promise<string> {
  const supabase = createServiceClient();
  const path = storagePath(storeType, itemDocId, slot);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Upload an image from a URL (fetch → blob → upload).
 * Useful for saving an AI-searched image candidate.
 */
export async function uploadStoreImageFromUrl(
  storeType: string,
  itemDocId: string,
  slot: ImageSlot,
  imageUrl: string,
): Promise<string> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error("Failed to fetch image");
  const blob = await res.blob();
  return uploadStoreImage(storeType, itemDocId, slot, blob);
}

/**
 * Delete an image from Supabase Storage.
 */
export async function deleteStoreImage(
  storeType: string,
  itemDocId: string,
  slot: ImageSlot,
): Promise<void> {
  const supabase = createServiceClient();
  const path = storagePath(storeType, itemDocId, slot);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error && !error.message.includes("Not Found")) throw error;
}
