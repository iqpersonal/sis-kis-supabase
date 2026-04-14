
import React, { useState } from "react";
import { View, Button, Image, ActivityIndicator, StyleSheet, Text, FlatList } from "react-native";
import * as ImagePicker from "expo-image-picker";

export default function ImageSearch() {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);

  const uploadAndSearch = async (uri: string) => {
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const formData = new FormData();
      formData.append("file", {
        uri,
        name: "search.jpg",
        type: "image/jpeg",
      } as any);
      const res = await fetch("http://localhost:8000/search-by-image", {
        method: "POST",
        body: formData,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      setResults(data.matches || []);
    } catch (e: any) {
      setError(e.message || "Failed to search");
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImage(result.assets[0].uri);
        uploadAndSearch(result.assets[0].uri);
      }
    } catch (e) {
      setError("Could not open camera.");
      setLoading(false);
    }
  };

  const pickFromGallery = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImage(result.assets[0].uri);
        uploadAndSearch(result.assets[0].uri);
      }
    } catch (e) {
      setError("Could not open gallery.");
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Button title="Take Photo" onPress={pickImage} />
      <View style={{ height: 8 }} />
      <Button title="Pick from Gallery" onPress={pickFromGallery} />
      {loading && <ActivityIndicator style={{ marginTop: 16 }} />}
      {error && <Text style={{ color: 'red', marginTop: 8 }}>{error}</Text>}
      {image && (
        <Image source={{ uri: image }} style={styles.image} resizeMode="contain" />
      )}
      {results.length > 0 && (
        <View style={{ marginTop: 16, width: '100%' }}>
          <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>Matches:</Text>
          <FlatList
            data={results}
            keyExtractor={(item, idx) => item.product_id || idx.toString()}
            renderItem={({ item }) => (
              <View style={styles.resultItem}>
                <Text>{item.name} (Score: {item.score})</Text>
              </View>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginTop: 24,
    width: '100%',
    flex: 1,
  },
  image: {
    width: 200,
    height: 200,
    marginTop: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  resultItem: {
    padding: 8,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
});
