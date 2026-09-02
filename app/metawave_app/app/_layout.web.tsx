import "./assets/css/global.css";
import { Stack, useSegments } from "expo-router";
import { useEffect } from "react";

export default function RootLayout() {
  const segments = useSegments();
  
  useEffect(() => {
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
    setMetaTag("mobile-web-app-capable", "yes");
    setMetaTag("apple-mobile-web-app-capable", "yes");
    setMetaTag("apple-mobile-web-app-status-bar-style", "black-translucent");
    setMetaTag("apple-mobile-web-app-title", "MetaWave");
    setMetaTag("description", "MetaWave - Genieße deinen persönlichen Live Radio Stream");
    
    // Open Graph
    setMetaTag("", "MetaWave", "og:title");
    setMetaTag("", "Dein persönlicher Live Radio Stream", "og:description");
    setMetaTag("", "website", "og:type");
    
    // Set favicon and icons - using maskable icons
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

    setLinkTag("icon", "/favicon.ico", undefined, "image/x-icon");
    setLinkTag("icon", "/icon-192-maskable.png", "192x192", "image/png");
    setLinkTag("icon", "/icon-512-maskable.png", "512x512", "image/png");
    setLinkTag("apple-touch-icon", "/apple-touch-icon.png");
    setLinkTag("manifest", "/manifest.json");
  }, []);

  // Update document title based on route
  useEffect(() => {
    const currentSegment = segments[segments.length - 1];
    let title = "MetaWave";
    
    switch (currentSegment) {
      case undefined:
      case "(index)":
        title = "MetaWave - Login";
        break;
      case "player":
        title = "MetaWave - Radio Player";
        break;
      case "settings":
        title = "MetaWave - Einstellungen";
        break;
      case "email":
        title = "MetaWave - E-Mail Notifier";
        break;
      case "impressum":
        title = "MetaWave - Impressum";
        break;
      case "datenschutz":
        title = "MetaWave - Datenschutz";
        break;
      default:
        title = "MetaWave";
    }
    
    document.title = title;
  }, [segments]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
