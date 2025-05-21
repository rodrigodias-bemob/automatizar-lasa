
FROM node:20-alpine

WORKDIR /app

# Copiar package.json e instalar dependências
COPY package.json ./
RUN npm install

# Copiar código fonte
COPY . .

# Saída de log
ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo

# Expor porta para o healthcheck
EXPOSE 8081

# Executar o worker com cron
CMD ["node", "s3-to-sftp-worker.js"]
