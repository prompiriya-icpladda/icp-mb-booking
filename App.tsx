import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import ScannerScreen from "./src/screens/ScannerScreen";

function RootNavigator() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return token ? <ScannerScreen /> : <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </AuthProvider>
  );
}
