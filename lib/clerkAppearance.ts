/** Clerk components (sign-in, sign-up, profile menu) in the Dreampool theme. */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#d38b4c",
    colorBackground: "#151a22",
    colorText: "#ebe6da",
    colorTextSecondary: "#9ba3b1",
    colorInputBackground: "#1c222d",
    colorInputText: "#ebe6da",
    colorDanger: "#e07a6e",
    colorSuccess: "#7fbf8e",
    colorNeutral: "#ebe6da",
    borderRadius: "0.75rem",
    fontFamily: "var(--font-body), system-ui, sans-serif",
  },
  elements: {
    card: { border: "1px solid #2a3240", boxShadow: "0 30px 80px -30px rgba(0,0,0,0.6)" },
    headerTitle: { fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.75rem", fontWeight: 600 },
    formButtonPrimary: { color: "#14100b", fontWeight: 600, textTransform: "none" as const },
    footerActionLink: { color: "#d38b4c" },
  },
};
