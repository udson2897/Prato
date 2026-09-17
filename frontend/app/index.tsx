import { View, ActivityIndicator, StyleSheet } from "react-native";
import { colors, registerThemedStyles } from "@/src/theme";

export default function Index() {
  return (
    <View style={styles.container} testID="root-index">
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
let styles = makeStyles();
registerThemedStyles(() => { styles = makeStyles(); });
