import "./assets/css/global.css";
import { Stack } from "expo-router";
import { useEffect } from "react";

export default function RootLayout() {
  useEffect(() => {
    // Set document title
    document.title = "MetaWave - Dein Live Radio Stream";
    
    // Set meta tags
    const setMetaTag = (name: string, content: string, property?: string) => {
      let meta = document.querySelector(property ? `meta[property="${property}"]` : `meta[name="${name}"]`);
      if (!meta) {
        meta = document.createElement("meta");
        if (property) {
          meta.setAttribute("property", property);
        } else {
          meta.setAttribute("name", name);
        }
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", content);
    };

    setMetaTag("theme-color", "#1C1C1C");
    setMetaTag("apple-mobile-web-app-capable", "yes");
    setMetaTag("apple-mobile-web-app-status-bar-style", "black-translucent");
    setMetaTag("apple-mobile-web-app-title", "MetaWave");
    setMetaTag("description", "MetaWave - Genieße deinen persönlichen Live Radio Stream");
    
    // Open Graph
    setMetaTag("", "MetaWave", "og:title");
    setMetaTag("", "Dein persönlicher Live Radio Stream", "og:description");
    setMetaTag("", "website", "og:type");
    
    // Set favicon and icons
    const setLinkTag = (rel: string, href: string, sizes?: string, type?: string) => {
      let link = document.querySelector(`link[rel="${rel}"]${sizes ? `[sizes="${sizes}"]` : ""}`);
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", rel);
        if (sizes) link.setAttribute("sizes", sizes);
        if (type) link.setAttribute("type", type);
        document.head.appendChild(link);
      }
      link.setAttribute("href", href);
    };

    setLinkTag("icon", "/assets/icons/web/favicon.ico", undefined, "image/x-icon");
    setLinkTag("icon", "/assets/icons/web/icon-192.png", "192x192", "image/png");
    setLinkTag("icon", "/assets/icons/web/icon-512.png", "512x512", "image/png");
    setLinkTag("apple-touch-icon", "/assets/icons/web/apple-touch-icon.png");
    setLinkTag("manifest", "/manifest.json");
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
