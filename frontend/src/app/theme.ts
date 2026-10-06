import { definePreset } from "@primeuix/themes";
import Aura from "@primeuix/themes/aura";

const green = {
  50: "#e8fbef",
  100: "#c6f5d9",
  200: "#9aeeba",
  300: "#6ce79a",
  400: "#43df7c",
  500: "#1ed760",
  600: "#1ab853",
  700: "#159745",
  800: "#107537",
  900: "#0b5428",
  950: "#063418",
};

const spotifySurface = {
  0: "#ffffff",
  50: "#f5f5f5",
  100: "#e5e5e5",
  200: "#b3b3b3",
  300: "#767676",
  400: "#5a5a5a",
  500: "#444444",
  600: "#333333",
  700: "#282828",
  800: "#1f1f1f",
  900: "#121212",
  950: "#000000",
};

export const SpotifyPreset = definePreset(Aura, {
  primitive: {
    borderRadius: {
      none: "0",
      xs: "4px",
      sm: "4px",
      md: "6px",
      lg: "6px",
      xl: "8px",
    },
    green,
  },
  semantic: {
    primary: green,
    colorScheme: {
      dark: {
        surface: spotifySurface,
        primary: {
          color: "{primary.500}",
          contrastColor: "#000000",
          hoverColor: "{primary.400}",
          activeColor: "{primary.600}",
        },
        highlight: {
          background: "color-mix(in srgb, {primary.500} 16%, transparent)",
          focusBackground: "color-mix(in srgb, {primary.500} 24%, transparent)",
          color: "#ffffff",
          focusColor: "#ffffff",
        },
        text: {
          color: "#ffffff",
          hoverColor: "#ffffff",
          mutedColor: "#b3b3b3",
          hoverMutedColor: "#ffffff",
        },
        content: {
          background: "#121212",
          hoverBackground: "#1f1f1f",
          borderColor: "rgba(255, 255, 255, 0.08)",
          color: "#ffffff",
          hoverColor: "#ffffff",
        },
        overlay: {
          select: { background: "#1f1f1f", borderColor: "rgba(255, 255, 255, 0.08)" },
          popover: { background: "#1f1f1f", borderColor: "rgba(255, 255, 255, 0.08)" },
          modal: { background: "#121212", borderColor: "rgba(255, 255, 255, 0.08)" },
        },
        formField: {
          background: "#1f1f1f",
          disabledBackground: "#121212",
          filledBackground: "#1f1f1f",
          filledHoverBackground: "#282828",
          filledFocusBackground: "#282828",
          borderColor: "transparent",
          hoverBorderColor: "rgba(255, 255, 255, 0.2)",
          focusBorderColor: "#ffffff",
          invalidBorderColor: "{red.400}",
          color: "#ffffff",
          disabledColor: "#767676",
          placeholderColor: "rgba(255, 255, 255, 0.4)",
          invalidPlaceholderColor: "{red.400}",
          floatLabelColor: "#b3b3b3",
          floatLabelFocusColor: "#ffffff",
          floatLabelActiveColor: "#b3b3b3",
          floatLabelInvalidColor: "{red.400}",
          iconColor: "#b3b3b3",
          shadow: "none",
        },
        navigation: {
          item: {
            focusBackground: "#1f1f1f",
            activeBackground: "#282828",
            color: "#b3b3b3",
            focusColor: "#ffffff",
            activeColor: "#ffffff",
            icon: { color: "#b3b3b3", focusColor: "#ffffff", activeColor: "#ffffff" },
          },
          submenuLabel: { background: "transparent", color: "#767676" },
          submenuIcon: { color: "#767676", focusColor: "#ffffff", activeColor: "#ffffff" },
        },
      },
    },
  },
  components: {
    button: {
      root: { borderRadius: "9999px", paddingX: "1.25rem" },
      colorScheme: {
        dark: {
          root: {
            primary: {
              background: "#1ed760",
              hoverBackground: "#3be477",
              activeBackground: "#1ab853",
              borderColor: "#1ed760",
              hoverBorderColor: "#3be477",
              activeBorderColor: "#1ab853",
              color: "#000000",
              hoverColor: "#000000",
              activeColor: "#000000",
            },
            secondary: {
              background: "#1f1f1f",
              hoverBackground: "#282828",
              activeBackground: "#333333",
              borderColor: "#1f1f1f",
              hoverBorderColor: "#282828",
              activeBorderColor: "#333333",
              color: "#ffffff",
              hoverColor: "#ffffff",
              activeColor: "#ffffff",
            },
            contrast: {
              background: "#ffffff",
              hoverBackground: "#f0f0f0",
              activeBackground: "#e0e0e0",
              borderColor: "#ffffff",
              hoverBorderColor: "#f0f0f0",
              activeBorderColor: "#e0e0e0",
              color: "#000000",
              hoverColor: "#000000",
              activeColor: "#000000",
            },
          },
          outlined: {
            primary: { color: "#ffffff", borderColor: "rgba(255, 255, 255, 0.3)", hoverBackground: "rgba(255, 255, 255, 0.08)", activeBackground: "rgba(255, 255, 255, 0.12)" },
            secondary: { color: "#ffffff", borderColor: "rgba(255, 255, 255, 0.3)", hoverBackground: "rgba(255, 255, 255, 0.08)", activeBackground: "rgba(255, 255, 255, 0.12)" },
          },
          text: {
            primary: { color: "#b3b3b3", hoverBackground: "rgba(255, 255, 255, 0.08)", activeBackground: "rgba(255, 255, 255, 0.12)" },
            secondary: { color: "#b3b3b3", hoverBackground: "rgba(255, 255, 255, 0.08)", activeBackground: "rgba(255, 255, 255, 0.12)" },
          },
        },
      },
    },
    inputtext: { root: { borderRadius: "4px" } },
    select: { root: { borderRadius: "4px" } },
    tag: { root: { borderRadius: "9999px" } },
    chip: { root: { borderRadius: "9999px" } },
    card: {
      root: { borderRadius: "6px", shadow: "0px 8px 24px 0px rgba(0, 0, 0, 0.5)" },
      colorScheme: { dark: { root: { background: "#121212", color: "#ffffff" } } },
    },
    dialog: {
      root: { borderRadius: "6px" },
      colorScheme: { dark: { root: { background: "#121212", borderColor: "rgba(255, 255, 255, 0.08)" } } },
    },
    datatable: {
      colorScheme: {
        dark: {
          header: { background: "transparent", borderColor: "rgba(255, 255, 255, 0.08)" },
          headerCell: { background: "transparent", hoverBackground: "#1f1f1f", borderColor: "rgba(255, 255, 255, 0.08)", color: "#b3b3b3", hoverColor: "#ffffff" },
          row: { background: "transparent", hoverBackground: "#1f1f1f", color: "#ffffff", hoverColor: "#ffffff" },
          bodyCell: { borderColor: "rgba(255, 255, 255, 0.04)" },
          footerCell: { background: "transparent", borderColor: "rgba(255, 255, 255, 0.08)" },
        },
      },
    },
    tree: {
      colorScheme: { dark: { root: { background: "transparent" } } },
    },
    toolbar: {
      root: { borderRadius: "6px" },
      colorScheme: { dark: { root: { background: "transparent", borderColor: "transparent" } } },
    },
    slider: {
      colorScheme: {
        dark: {
          track: { background: "#5a5a5a" },
          range: { background: "#ffffff" },
          handle: { background: "#ffffff", hoverBackground: "#ffffff", content: { background: "#ffffff", hoverBackground: "#ffffff" } },
        },
      },
    },
    progressbar: {
      colorScheme: { dark: { root: { background: "#333333" }, value: { background: "#1ed760" } } },
    },
    checkbox: {
      colorScheme: {
        dark: {
          root: { background: "#1f1f1f", borderColor: "#767676", hoverBorderColor: "#ffffff", checkedBackground: "#1ed760", checkedBorderColor: "#1ed760", checkedHoverBackground: "#3be477", checkedHoverBorderColor: "#3be477" },
          icon: { checkedColor: "#000000", checkedHoverColor: "#000000" },
        },
      },
    },
  },
});
