![MetaWave Banner](/concept/images/MetaWave%20-%20Banner.png)

# MetaWave | Projekt
Music without limits, streaming without ads

---

## Inhaltsverzeichnis
- [MetaWave | Projekt](#metawave--projekt)
  - [Inhaltsverzeichnis](#inhaltsverzeichnis)
  - [Ziel](#ziel)
  - [Infrasturktur](#infrasturktur)
  - [Funktionen](#funktionen)
    - [Client](#client)
    - [Server (Auth + Radio + Notification)](#server-auth--radio--notification)
  - [Design](#design)
  - [Programmiersprachen](#programmiersprachen)
    - [Client](#client-1)
    - [Server](#server)


## Ziel
Das Ziel dieser Lösung ist es das man mit Freunden oder Arbeitskollegen eine Youtube und / oder Spotify Playlist führen kann und man dann ohne Werbung wie bei einem Radio die Lieder Endlos reinhören kann. Dabei kann jeder die Lieder überspringen, verschieben, neu shuffeln, eigene Streams erstellen mit Filter auf Artist oder anderen Faktoren. Das ganze wird durch ein Login Token geschützt welcher vom Server jeden Monat generiert wird und via Push Notification in die Whatsapp oder Signal Gruppe geschickt wird.

## Infrasturktur

![Infrastruktur](/concept/images/Infrastructure.drawio.png)

Die Infrastruktur wurde so gewählt, da man sich nicht in bewägung gezogen hat einen Reverse Tunnel oder CloudFlare Tunnel zu erstellen und da man sich mehr mit DNS Records, Firewall und Sicherheit von Aussen sich beschäftigen wollte.

Das Projekt in der produktiven Umgebung hat ein sicheres aber auch grosses Setup. Der Ablauf geht wie folgt:

Zuerst wird auf `Hostpoint` oder HostServer der Wahl eine Webseite erstellt wo wir dann den Client Code Deployen, zusätzlich machen wir einen `DNS A-Record` auf die Öffentliche IP meines Netzwerk.

Als nächstes wird eine Portweiterleitung erstellt, welche dann auf den HomeServer `NGNIX Reverse Proxy` weiterleitet. Dieser wiederum leitet mit dem Loadbalancer auf einer der 2 Nodes die erstellt werden.

Die Nodes beinhalten den Server-Code für die Generierung und Notifizierung vom WaveToken, die Authentifizierung sowie den Radio-Service.

Jeder Node hat auf den gleichen Speicherzugang logischerweise.

**Warum wird der Speicher nicht gespiegelt?**
Die Entscheidung, den Speicher nicht zu spiegeln, liegt darin, dass ich auf meinem Proxmox-Server zu Hause einfach nicht genug Speicherplatz habe, wenn ich nebenbei einen JellyFin-Server betreibe.

## Funktionen
### Client
- Der Client hat ein Login Formular, wo er 

### Server (Auth + Radio + Notification)
- **Authentication Service**
  - Generiert Monatlich einen WaveToken für das Login
  - Man kann sich mit WaveToken einloggen und kriegt einen Token
  - Man kann den Token validieren um den Token zu verlängern
- **Notification Service**
  - Bei der montlichen WaveToken erneuerung wird in den Whatsapp odr. Signal Chat eine Notification mit dem Token geschickt.
- **RadioEngine Service**
  - Man hat nur zugang zum Service wenn der Auth Service es erlaubt.
  - MainStream wird endlos abgespielt und dabei wird eine Queue generiert
  - Man kann die Metadaten von den aktuell abgespielten Song auslesen
  - Man kann die Metadaten von allen Songs in der Queue auslesen
  - Man kann hat die volle Kontrolle über den MainStream und kann skippen, lautstärke regulieren, auf ein bestimmten song springen, die zu abgespielten songs zurück springen, die noch nicht abgespielten Songs neu shuffeln.
  - Der MainStream wir bei jeder neuen Queue neu geshuffelt.

Genaueren Informationen zu den Endpunkten finden Sie im [ENDPOINTS.md](/concept/ENDPOINTS.md) 

## Design
Es soll ein simples Youtube Musik & Spotify Design haben, sodass man es auf Desktop und auf dem Handy benutzen kann. Der Client ist Mobile first gebaut.

## Programmiersprachen
### Client
- React Native, wegen der Android & iOS unterstützung
### Server
- Node.js um im einklang mit dem Client zu sein