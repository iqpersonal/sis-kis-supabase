import React, { useState } from "react";
import { View, Button, Image, ActivityIndicator, StyleSheet, Text } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadStoreImage } from "../lib/store-image";
import { updateItem } from "../lib/store-actions";
import { GENERAL_STORE_CONFIG } from "../lib/store-config";

interface Props {
  itemDocId: string;
  userId: string;
  initialImageUrl?: string;
}

export default function ProductImageUploader({ itemDocId, userId, initialImageUrl }: Props) {
  const [image, setImage] = useState<string | undefined>(initialImageUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickAndUpload = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const localUri = result.assets[0].uri;
        // Upload to Firebase Storage
        const downloadUrl = await uploadStoreImage(
          "general", // storeType
          itemDocId,
          "custom",
          localUri
        );
        // Update Firestore
        await updateItem(
          GENERAL_STORE_CONFIG,
          itemDocId,
          { image_url: downloadUrl },
          userId
        );
        setImage(downloadUrl);
      }
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {image ? (
        <Image source={{ uri: image }} style={styles.image} />
      ) : (
        <Text>No image uploaded</Text>
      )}
      {loading && <ActivityIndicator size="small" />}
      {error && <Text style={{ color: "red" }}>{error}</Text>}
      <Button title="Upload/Change Image" onPress={pickAndUpload} disabled={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginVertical: 16,
  },
  image: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginBottom: 8,
  },
});
