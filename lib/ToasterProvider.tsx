"use client";

import { Toaster } from "react-hot-toast";

export const ToasterProvider = () => (
  <Toaster toastOptions={{ style: { background: "#1c222d", color: "#ebe6da", border: "1px solid #2a3240" } }} />
);
