import { Link } from "expo-router";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function AdminHome() {
  return (
    <SafeAreaView style={styles.page}>
      <Text style={styles.eyebrow}>PRIVATE ADMIN STAGING</Text>
      <Text style={styles.title}>Payment review, wherever you are.</Text>
      <Text style={styles.body}>Native alerts open the current authorized record. Approval always requires authentication and server authorization.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>ACTIONABLE REVIEWS</Text>
        <Text style={styles.metric}>0</Text>
        <Text style={styles.note}>Connect Supabase Auth and register this TestFlight installation to begin.</Text>
      </View>
      <Link href="/(admin)/payments" style={styles.button}>Open verification queue</Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#fff", padding: 28, gap: 18 },
  eyebrow: { marginTop: 28, color: "#747b78", fontSize: 11, letterSpacing: 1.4 },
  title: { color: "#202726", fontSize: 43, lineHeight: 46, letterSpacing: -1.8 },
  body: { color: "#5f6764", fontSize: 16, lineHeight: 25 },
  card: { marginTop: 20, borderWidth: 1, borderColor: "#dde1df", borderRadius: 16, padding: 24 },
  label: { color: "#747b78", fontSize: 10, letterSpacing: 1.1 },
  metric: { color: "#202726", fontSize: 52, marginVertical: 14 },
  note: { color: "#5f6764", lineHeight: 20 },
  button: { overflow: "hidden", backgroundColor: "#202726", color: "#fff", padding: 16, borderRadius: 24, textAlign: "center" },
});
