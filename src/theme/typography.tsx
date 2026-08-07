import React, { forwardRef } from "react";
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";

export const FONT_FAMILIES = {
  regular: "Kanit_400Regular",
  medium: "Kanit_500Medium",
  semiBold: "Kanit_600SemiBold",
  bold: "Kanit_700Bold",
} as const;

export type AppTextRef = React.ElementRef<typeof NativeText>;
export type AppTextInputRef = React.ElementRef<typeof NativeTextInput>;

function familyForWeight(fontWeight?: TextStyle["fontWeight"]) {
  if (fontWeight == null || fontWeight === "normal") return FONT_FAMILIES.regular;
  if (fontWeight === "bold") return FONT_FAMILIES.bold;

  const numericWeight =
    typeof fontWeight === "number" ? fontWeight : Number.parseInt(fontWeight, 10);

  if (Number.isNaN(numericWeight)) return FONT_FAMILIES.regular;
  if (numericWeight >= 700) return FONT_FAMILIES.bold;
  if (numericWeight >= 600) return FONT_FAMILIES.semiBold;
  if (numericWeight >= 500) return FONT_FAMILIES.medium;

  return FONT_FAMILIES.regular;
}

function fontStyleFor(style: StyleProp<TextStyle>) {
  const flattened = StyleSheet.flatten(style);

  return {
    fontFamily: flattened?.fontFamily ?? familyForWeight(flattened?.fontWeight),
  };
}

export const AppText = forwardRef<AppTextRef, TextProps>(
  function AppText({ style, ...props }, ref) {
    return <NativeText ref={ref} {...props} style={[fontStyleFor(style), style]} />;
  },
);

export const AppTextInput = forwardRef<AppTextInputRef, TextInputProps>(function AppTextInput({ style, ...props }, ref) {
  return <NativeTextInput ref={ref} {...props} style={[fontStyleFor(style), style]} />;
});
