import { storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

/**
 * Storage paths (shared with web):
 *   store-images/{storeType}/{itemDocId}/catalog   — AI/web-sourced image
 *   store-images/{storeType}/{itemDocId}/custom     — Camera/gallery photo
 */

type ImageSlot = "catalog" | "custom";

function storagePath(storeType: string, itemDocId: string, slot: ImageSlot) {
  return `store-images/${storeType}/${itemDocId}/${slot}`;
}

/**
 * Upload a local file URI (from expo-image-picker) to Firebase Storage.
 * Returns the public download URL.
 */
export async function uploadStoreImage(
  storeType: string,
  itemDocId: string,
  slot: ImageSlot,
  localUri: string,
): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();

  const path = storagePath(storeType, itemDocId, slot);
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

/**
 * Upload an image from a remote URL (e.g. AI-searched candidate).
 */
export async function uploadStoreImageFromUrl(
  storeType: string,
  itemDocId: string,
  slot: ImageSlot,
  imageUrl: string,
): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Failed to fetch image");
  const blob = await response.blob();

  const path = storagePath(storeType, itemDocId, slot);
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

/**
 * Delete an image from Firebase Storage.
 */
export async function deleteStoreImage(
  storeType: string,
  itemDocId: string,
  slot: ImageSlot,
): Promise<void> {
  const path = storagePath(storeType, itemDocId, slot);
  const storageRef = ref(storage, path);
  try {
    await deleteObject(storageRef);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "storage/object-not-found") return;
    throw e;
  }
}
