import { getFirebaseStorage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

/**
 * Storage paths:
 *   store-images/{storeType}/{itemDocId}/catalog   — AI/web-sourced image
 *   store-images/{storeType}/{itemDocId}/custom     — User-uploaded photo
 */

type ImageSlot = "catalog" | "custom";

function storagePath(storeType: string, itemDocId: string, slot: ImageSlot) {
  return `store-images/${storeType}/${itemDocId}/${slot}`;
}

/**
 * Upload a file (Blob/File from web) to Firebase Storage.
 * Returns the public download URL.
 */
export async function uploadStoreImage(
  storeType: string,
  itemDocId: string,
  slot: ImageSlot,
  file: Blob | File,
): Promise<string> {
  const storage = getFirebaseStorage();
  const path = storagePath(storeType, itemDocId, slot);
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
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
 * Delete an image from Firebase Storage.
 */
export async function deleteStoreImage(
  storeType: string,
  itemDocId: string,
  slot: ImageSlot,
): Promise<void> {
  const storage = getFirebaseStorage();
  const path = storagePath(storeType, itemDocId, slot);
  const storageRef = ref(storage, path);
  try {
    await deleteObject(storageRef);
  } catch (e: unknown) {
    // Ignore "object-not-found" — already deleted
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "storage/object-not-found") return;
    throw e;
  }
}
