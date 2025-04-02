import type React from "react"
import "./global.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Dreampool | Landing Page",
  description: "",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

