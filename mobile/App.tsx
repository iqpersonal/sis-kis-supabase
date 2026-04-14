import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import ImageSearch from './src/components/ImageSearch';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 16 }}>Store Product Search by Image</Text>
      <ImageSearch />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
});
