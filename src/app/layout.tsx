import "./globals.scss";

import type { Metadata } from "next";
import {AppRouterCacheProvider} from "@mui/material-nextjs/v13-appRouter";
import {CssBaseline, ThemeProvider} from "@mui/material";
import {comfortaa, darkTheme, pacifico} from "@/app/theme";
import Footer from "@components/Footer/Footer";
import Header from "@components/Header/Header";

export const metadata: Metadata = {
  title: "EspressoShare",
  description: "A simple clip sharing platform.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${pacifico.variable} ${comfortaa.variable}`}>
      <body>
      <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <ThemeProvider theme={darkTheme}>
            <CssBaseline />

            <Header />

            <main>
                {children}
            </main>

            <Footer />
          </ThemeProvider>
      </AppRouterCacheProvider>
      </body>
    </html>
  );
}
