
FROM node:20-alpine

WORKDIR /app

# Copiar package.json e instalar dependências
COPY package.json ./
RUN npm install

# Copiar código fonte
COPY . .

# Executar o worker
CMD ["node", "s3-to-sftp-worker.js"]
