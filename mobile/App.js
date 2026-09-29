import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>TailorApp</Text>
        <Text style={styles.subtitle}>Customer orders, measurements, and fittings</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today's tasks</Text>
          <Text style={styles.item}>- 2 fittings scheduled</Text>
          <Text style={styles.item}>- 1 new measurement request</Text>
          <Text style={styles.item}>- 3 ready-to-pickup orders</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 8,
    color: '#4b5563',
    fontSize: 16,
  },
  card: {
    marginTop: 24,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
    color: '#111827',
  },
  item: {
    color: '#374151',
    fontSize: 16,
    marginBottom: 8,
  },
});
