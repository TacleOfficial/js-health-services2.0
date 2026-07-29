import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function PaymentQueue() {
  return (
    <SafeAreaView style={styles.page}>
      <Text style={styles.eyebrow}>PAYMENT OPERATIONS</Text>
      <Text style={styles.title}>Verification queue</Text>
      <View style={styles.empty}><Text style={styles.emptyTitle}>No connected submissions</Text><Text style={styles.body}>The durable in-app inbox remains available even when push delivery is disabled.</Text></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#fff", padding: 24 },
  eyebrow: { color: "#747b78", fontSize: 10, letterSpacing: 1.2 },
  title: { color: "#202726", fontSize: 36, marginTop: 12 },
  empty: { borderWidth: 1, borderColor: "#dde1df", borderRadius: 16, padding: 24, marginTop: 30 },
  emptyTitle: { color: "#202726", fontSize: 18, marginBottom: 8 },
  body: { color: "#5f6764", lineHeight: 21 },
});
