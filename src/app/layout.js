import "./globals.css";

export const metadata = {
  title: "SBIZ NAVMANAGER - Prorrogação de Horário",
  description: "Sistema para solicitação de prorrogação de horário de funcionamento - NAV Brasil - DNIZ.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
