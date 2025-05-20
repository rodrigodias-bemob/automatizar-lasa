
FROM node:20-alpine

WORKDIR /app

# Criar diretório temporário com permissões corretas
RUN mkdir -p /app/temp && chmod 777 /app/temp

# Copiar package.json e instalar dependências
COPY package.json ./
RUN npm install

# Copiar código fonte
COPY . .

# Saída de log
ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo

# Executar o worker com cron
CMD ["node", "s3-to-sftp-worker.js"]
