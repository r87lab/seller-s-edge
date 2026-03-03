module.exports = {
  apps: [
    {
      name: "vipo-app",
      // Em vez de "npm run dev", executamos o Vite diretamente pelo Node
      script: "./node_modules/vite/bin/vite.js",
      args: "--host 127.0.0.1 --port 8080 --strictPort",
    },
    {
      name: "vipo-tunnel",
      // Executamos o SSH diretamente (sem passar pelo npm)
      script: "ssh",
      // O 'interpreter: none' avisa ao PM2 para NÃO tentar rodar o ssh como script JS
      interpreter: "none",
      args: "-o ServerAliveInterval=60 -R vipo-meli-app:80:127.0.0.1:8080 serveo.net",
    },
  ],
};